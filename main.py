from fastapi import FastAPI, Request, Depends
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from kubernetes import client, config
from kubernetes.client.rest import ApiException
import os
from typing import List, Dict
import json
import gzip
from auth import get_current_user

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


def get_k8s_contexts() -> List[str]:
    """Get all available Kubernetes contexts."""
    try:
        contexts, active_context = config.list_kube_config_contexts()
        return [context["name"] for context in contexts]
    except Exception as e:
        print(f"Error getting contexts: {e}")
        return []


def get_pods_for_context(context_name: str) -> List[Dict]:
    """Get pods from all namespaces for a specific context, excluding 'kube-system'."""
    try:
        config.load_kube_config(context=context_name)
        v1 = client.CoreV1Api()
        pods = []

        # Get all pods from all namespaces in a single call
        try:
            all_pods = v1.list_pod_for_all_namespaces()
            for pod in all_pods.items:
                # Skip pods in kube-system and gke-gmp-system namespaces (system stuff)
                if pod.metadata.namespace in ["kube-system", "gke-gmp-system"]:
                    continue

                # Calculate total restarts across all containers
                total_restarts = 0
                if pod.status.container_statuses:
                    for container in pod.status.container_statuses:
                        total_restarts += container.restart_count

                pods.append(
                    {
                        "name": pod.metadata.name,
                        "namespace": pod.metadata.namespace,
                        "status": pod.status.phase,
                        "restarts": total_restarts,
                        "context": context_name,
                        "age": str(pod.metadata.creation_timestamp),
                    }
                )
        except ApiException as e:
            print(f"Error getting pods: {e}")
            return []

        print(f"Total pods found: {len(pods)}")
        return pods
    except Exception as e:
        print(f"Error getting pods for context {context_name}: {e}")
        return []


@app.get("/", response_class=HTMLResponse)
async def root(request: Request, username: str = Depends(get_current_user)):
    """Render the main page."""
    return templates.TemplateResponse("index.html", {"request": request, "username": username})


@app.get("/api/contexts")
async def get_contexts(username: str = Depends(get_current_user)):
    """Get all available Kubernetes contexts."""
    return {"contexts": get_k8s_contexts()}


@app.get("/api/pods/{context}")
async def get_pods(context: str, username: str = Depends(get_current_user)):
    """Get pods for a specific context or all contexts if context is 'all'."""
    if context == "all":
        all_pods = []
        contexts = get_k8s_contexts()
        for ctx in contexts:
            pods = get_pods_for_context(ctx)
            all_pods.extend(pods)
        return {"pods": all_pods}
    return {"pods": get_pods_for_context(context)}


@app.get("/api/logs/{context}/{namespace}/{pod}")
async def get_pod_logs(context: str, namespace: str, pod: str, request: Request, username: str = Depends(get_current_user)):
    """Get logs for a specific pod."""
    print(f"Starting log retrieval for pod: {pod} in namespace: {namespace}, context: {context}")
    try:
        config.load_kube_config(context=context)
        v1 = client.CoreV1Api()
        logs = v1.read_namespaced_pod_log(name=pod, namespace=namespace)
        log_size = len(logs) if logs else 0
        
        # Check if browser accepts gzip compression
        accept_encoding = request.headers.get("accept-encoding", "")
        if "gzip" in accept_encoding.lower() and logs:
            # Compress the logs
            response_data = json.dumps({"logs": logs}).encode('utf-8')
            compressed_data = gzip.compress(response_data)
            compressed_size = len(compressed_data)
            print(f"Completed log retrieval for pod: {pod}, original size: {log_size} bytes, compressed size: {compressed_size} bytes")
            return Response(
                content=compressed_data,
                media_type="application/json",
                headers={
                    "Content-Encoding": "gzip",
                    "Content-Length": str(compressed_size)
                }
            )
        else:
            print(f"Completed log retrieval for pod: {pod}, content size: {log_size} bytes")
            return {"logs": logs}
    except ApiException as e:
        print(f"Failed to retrieve logs for pod: {pod}, error: {str(e)}")
        if e.status == 403:
            return {"error": "Permission denied to access pod logs"}
        return {"error": str(e)}
    except Exception as e:
        print(f"Failed to retrieve logs for pod: {pod}, error: {str(e)}")
        return {"error": str(e)}


@app.get("/api/describe/{context}/{namespace}/{pod}")
async def describe_pod(context: str, namespace: str, pod: str, username: str = Depends(get_current_user)):
    """Get detailed information about a specific pod."""
    try:
        config.load_kube_config(context=context)
        v1 = client.CoreV1Api()
        pod_info = v1.read_namespaced_pod(name=pod, namespace=namespace)

        # Get pod events
        field_selector = (
            f"involvedObject.name={pod},involvedObject.namespace={namespace}"
        )
        events = v1.list_namespaced_event(
            namespace=namespace, field_selector=field_selector
        )

        # Convert pod info to a dictionary format
        pod_details = {
            "metadata": {
                "name": pod_info.metadata.name,
                "namespace": pod_info.metadata.namespace,
                "labels": pod_info.metadata.labels,
                "annotations": pod_info.metadata.annotations,
                "creation_timestamp": str(pod_info.metadata.creation_timestamp),
            },
            "spec": {
                "node_name": pod_info.spec.node_name,
                "containers": [
                    {
                        "name": container.name,
                        "image": container.image,
                        "ports": (
                            [
                                {
                                    "container_port": port.container_port,
                                    "protocol": port.protocol,
                                }
                                for port in container.ports
                            ]
                            if container.ports
                            else []
                        ),
                        "resources": (
                            {
                                "requests": container.resources.requests,
                                "limits": container.resources.limits,
                            }
                            if container.resources
                            else {}
                        ),
                    }
                    for container in pod_info.spec.containers
                ],
            },
            "status": {
                "phase": pod_info.status.phase,
                "pod_ip": pod_info.status.pod_ip,
                "host_ip": pod_info.status.host_ip,
                "container_statuses": (
                    [
                        {
                            "name": status.name,
                            "state": str(status.state),
                            "ready": status.ready,
                            "restart_count": status.restart_count,
                            "image": status.image,
                            "image_id": status.image_id,
                        }
                        for status in pod_info.status.container_statuses
                    ]
                    if pod_info.status.container_statuses
                    else []
                ),
            },
            "events": [
                {
                    "type": event.type,
                    "reason": event.reason,
                    "message": event.message,
                    "last_timestamp": str(event.last_timestamp),
                    "count": event.count,
                    "source": {
                        "component": event.source.component if event.source else None,
                        "host": event.source.host if event.source else None,
                    },
                }
                for event in events.items
            ],
            "manifest": {
                "name": pod_info.metadata.name,
                "namespace": pod_info.metadata.namespace,
                "priority": (
                    pod_info.spec.priority
                    if hasattr(pod_info.spec, "priority")
                    else None
                ),
                "node": pod_info.spec.node_name,
                "start_time": (
                    str(pod_info.status.start_time)
                    if pod_info.status.start_time
                    else None
                ),
                "labels": pod_info.metadata.labels,
                "annotations": pod_info.metadata.annotations,
                "status": pod_info.status.phase,
                "ip": pod_info.status.pod_ip,
                "ips": (
                    [ip.ip for ip in pod_info.status.pod_ips]
                    if hasattr(pod_info.status, "pod_ips")
                    else None
                ),
                "controlled_by": (
                    pod_info.metadata.owner_references[0].kind
                    + "/"
                    + pod_info.metadata.owner_references[0].name
                    if pod_info.metadata.owner_references
                    else None
                ),
                "containers": [
                    {
                        "name": container.name,
                        "container_id": next(
                            (
                                status.container_id
                                for status in pod_info.status.container_statuses
                                if status.name == container.name
                            ),
                            None,
                        ),
                        "image": container.image,
                        "image_id": next(
                            (
                                status.image_id
                                for status in pod_info.status.container_statuses
                                if status.name == container.name
                            ),
                            None,
                        ),
                        "ports": (
                            [
                                {
                                    "container_port": port.container_port,
                                    "protocol": port.protocol,
                                }
                                for port in container.ports
                            ]
                            if container.ports
                            else []
                        ),
                        "host_ports": (
                            [
                                {"host_port": port.host_port, "protocol": port.protocol}
                                for port in container.ports
                                if hasattr(port, "host_port")
                            ]
                            if container.ports
                            else []
                        ),
                        "command": container.command if container.command else None,
                        "args": container.args if container.args else None,
                        "state": next(
                            (
                                str(status.state)
                                for status in pod_info.status.container_statuses
                                if status.name == container.name
                            ),
                            None,
                        ),
                        "ready": next(
                            (
                                status.ready
                                for status in pod_info.status.container_statuses
                                if status.name == container.name
                            ),
                            False,
                        ),
                        "restart_count": next(
                            (
                                status.restart_count
                                for status in pod_info.status.container_statuses
                                if status.name == container.name
                            ),
                            0,
                        ),
                        "environment": (
                            [
                                {
                                    "name": env.name,
                                    "value": env.value if env.value else None,
                                    "value_from": (
                                        str(env.value_from) if env.value_from else None
                                    ),
                                }
                                for env in container.env
                            ]
                            if container.env
                            else []
                        ),
                        "mounts": (
                            [
                                {
                                    "name": mount.name,
                                    "mount_path": mount.mount_path,
                                    "read_only": mount.read_only,
                                }
                                for mount in container.volume_mounts
                            ]
                            if container.volume_mounts
                            else []
                        ),
                        "resources": (
                            {
                                "requests": (
                                    container.resources.requests
                                    if container.resources
                                    and container.resources.requests
                                    else None
                                ),
                                "limits": (
                                    container.resources.limits
                                    if container.resources
                                    and container.resources.limits
                                    else None
                                ),
                            }
                            if container.resources
                            else None
                        ),
                    }
                    for container in pod_info.spec.containers
                ],
                "volumes": (
                    [
                        {
                            "name": volume.name,
                            "config_map": (
                                str(volume.config_map) if volume.config_map else None
                            ),
                            "secret": str(volume.secret) if volume.secret else None,
                            "empty_dir": (
                                str(volume.empty_dir) if volume.empty_dir else None
                            ),
                            "persistent_volume_claim": (
                                str(volume.persistent_volume_claim)
                                if volume.persistent_volume_claim
                                else None
                            ),
                            "host_path": (
                                str(volume.host_path) if volume.host_path else None
                            ),
                            "downward_api": (
                                str(volume.downward_api)
                                if volume.downward_api
                                else None
                            ),
                            "projected": (
                                str(volume.projected) if volume.projected else None
                            ),
                            "csi": str(volume.csi) if volume.csi else None,
                            "ephemeral": (
                                str(volume.ephemeral) if volume.ephemeral else None
                            ),
                        }
                        for volume in pod_info.spec.volumes
                    ]
                    if pod_info.spec.volumes
                    else []
                ),
            },
        }
        return {"pod_details": pod_details}
    except ApiException as e:
        if e.status == 403:
            return {"error": "Permission denied to access pod details"}
        return {"error": str(e)}
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
