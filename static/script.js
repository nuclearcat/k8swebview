// DOM Elements
const contextSelect = document.getElementById('context-select');
const copyContextBtn = document.getElementById('copy-context');
const refreshContextBtn = document.getElementById('refresh-context');
const podsTableBody = document.getElementById('pods-table-body');
const logsModal = document.getElementById('logs-modal');
const logsContent = document.getElementById('logs-content');
const modalTitle = document.getElementById('modal-title');
const spinnerModal = document.getElementById('spinner-modal');
const spinnerText = document.getElementById('spinner-text');
const describeModal = document.getElementById('describe-modal');
const describeContent = document.getElementById('describe-content');
const describeModalTitle = document.getElementById('describe-modal-title');

// Load contexts when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    await loadContexts();
    // Restore selected context from localStorage
    const savedContext = localStorage.getItem('selectedContext');
    if (savedContext) {
        contextSelect.value = savedContext;
        loadPods();
        copyContextBtn.disabled = false;
        refreshContextBtn.disabled = false;
    }
});

// Event Listeners
contextSelect.addEventListener('change', () => {
    loadPods();
    copyContextBtn.disabled = !contextSelect.value;
    refreshContextBtn.disabled = !contextSelect.value;
    // Save selected context to localStorage
    if (contextSelect.value) {
        localStorage.setItem('selectedContext', contextSelect.value);
    } else {
        localStorage.removeItem('selectedContext');
    }
});

copyContextBtn.addEventListener('click', copyContextToClipboard);
refreshContextBtn.addEventListener('click', () => {
    if (contextSelect.value) {
        loadPods();
    }
});

// Add event listener for Escape key
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeLogsModal();
        closeDescribeModal();
    }
});

// Add event listeners for clicking outside modals
logsModal.addEventListener('click', (event) => {
    if (event.target === logsModal) {
        closeLogsModal();
    }
});

describeModal.addEventListener('click', (event) => {
    if (event.target === describeModal) {
        closeDescribeModal();
    }
});

// Spinner functions
function showSpinner(message = 'Loading...') {
    spinnerText.textContent = message;
    spinnerModal.classList.remove('hidden');
}

function hideSpinner() {
    spinnerModal.classList.add('hidden');
}

// Utility functions
function formatAge(creationTimestamp) {
    const creationDate = new Date(creationTimestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now - creationDate) / 1000);
    
    if (diffInSeconds < 60) {
        return `${diffInSeconds}s`;
    }
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return `${diffInMinutes}m`;
    }
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return `${diffInHours}h`;
    }
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d`;
}

// Functions
async function loadContexts() {
    showSpinner('Loading contexts...');
    try {
        const response = await fetch('/api/contexts');
        if (response.status === 401) {
            window.location.reload();
            return;
        }
        const data = await response.json();
        
        contextSelect.innerHTML = '<option value="">Select a context</option>';
        // Add "All contexts" option
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = 'All contexts';
        contextSelect.appendChild(allOption);
        
        data.contexts.forEach(context => {
            const option = document.createElement('option');
            option.value = context;
            option.textContent = context;
            contextSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading contexts:', error);
        contextSelect.innerHTML = '<option value="">Error loading contexts</option>';
    } finally {
        hideSpinner();
    }
}

async function copyContextToClipboard() {
    const context = contextSelect.value;
    if (!context) return;

    try {
        await navigator.clipboard.writeText(context);
        
        // Visual feedback
        const originalText = copyContextBtn.textContent;
        copyContextBtn.textContent = 'Copied!';
        copyContextBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
        copyContextBtn.classList.add('bg-green-600', 'hover:bg-green-700');
        
        // Reset button after 2 seconds
        setTimeout(() => {
            copyContextBtn.textContent = originalText;
            copyContextBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
            copyContextBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
        }, 2000);
    } catch (error) {
        console.error('Error copying to clipboard:', error);
        alert('Failed to copy context name to clipboard');
    }
}

async function loadPods() {
    const context = contextSelect.value;
    if (!context) {
        podsTableBody.innerHTML = '';
        return;
    }

    showSpinner('Loading pods...');
    try {
        const response = await fetch(`/api/pods/${context}`);
        if (response.status === 401) {
            window.location.reload();
            return;
        }
        const data = await response.json();
        
        podsTableBody.innerHTML = '';
        data.pods.forEach(pod => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${pod.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${pod.namespace}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span class="status-${pod.status.toLowerCase()}">${pod.status}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatAge(pod.age)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span class="restart-count ${pod.restarts > 0 ? 'text-red-600' : 'text-green-600'}">${pod.restarts}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                    <button 
                        onclick="viewLogs('${pod.context}', '${pod.namespace}', '${pod.name}')"
                        class="view-logs-btn"
                    >
                        View Logs
                    </button>
                    <button 
                        onclick="describePod('${pod.context}', '${pod.namespace}', '${pod.name}')"
                        class="describe-pod-btn"
                    >
                        Describe
                    </button>
                </td>
            `;
            podsTableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading pods:', error);
        podsTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-4 text-center text-sm text-red-600">
                    Error loading pods
                </td>
            </tr>
        `;
    } finally {
        hideSpinner();
    }
}

async function viewLogs(context, namespace, pod) {
    try {
        modalTitle.textContent = `Logs for ${pod} (${namespace})`;
        logsContent.textContent = 'Loading logs...';
        logsModal.classList.remove('hidden');
        showSpinner('Loading logs...');

        const response = await fetch(`/api/logs/${context}/${namespace}/${pod}`);
        if (response.status === 401) {
            window.location.reload();
            return;
        }
        const data = await response.json();
        
        if (data.error) {
            logsContent.textContent = `Error: ${data.error}`;
        } else {
            logsContent.textContent = data.logs;
            // Scroll to the bottom of the logs
            logsContent.scrollTop = logsContent.scrollHeight;
        }
    } catch (error) {
        console.error('Error loading logs:', error);
        logsContent.textContent = 'Error loading logs';
    } finally {
        hideSpinner();
    }
}

function closeLogsModal() {
    logsModal.classList.add('hidden');
    logsContent.textContent = '';
}

async function describePod(context, namespace, pod) {
    try {
        describeModalTitle.textContent = `Details for ${pod} (${namespace})`;
        describeContent.textContent = 'Loading pod details...';
        describeModal.classList.remove('hidden');
        showSpinner('Loading pod details...');

        const response = await fetch(`/api/describe/${context}/${namespace}/${pod}`);
        if (response.status === 401) {
            window.location.reload();
            return;
        }
        const data = await response.json();
        
        if (data.error) {
            describeContent.textContent = `Error: ${data.error}`;
        } else {
            const details = data.pod_details;
            let formattedOutput = '';

            // Add Events section
            formattedOutput += '=== Events ===\n';
            if (details.events && details.events.length > 0) {
                details.events.forEach(event => {
                    formattedOutput += `Type: ${event.type}\n`;
                    formattedOutput += `Reason: ${event.reason}\n`;
                    formattedOutput += `Message: ${event.message}\n`;
                    formattedOutput += `Last Timestamp: ${event.last_timestamp}\n`;
                    formattedOutput += `Count: ${event.count}\n`;
                    if (event.source.component) {
                        formattedOutput += `Source Component: ${event.source.component}\n`;
                    }
                    if (event.source.host) {
                        formattedOutput += `Source Host: ${event.source.host}\n`;
                    }
                    formattedOutput += '\n';
                });
            } else {
                formattedOutput += 'No events found\n\n';
            }

            // Add Manifest section
            formattedOutput += '=== Pod Manifest ===\n';
            const manifest = details.manifest;
            
            // Basic Info
            formattedOutput += `Name:         ${manifest.name}\n`;
            formattedOutput += `Namespace:    ${manifest.namespace}\n`;
            if (manifest.priority) formattedOutput += `Priority:     ${manifest.priority}\n`;
            formattedOutput += `Node:         ${manifest.node}\n`;
            if (manifest.start_time) formattedOutput += `Start Time:   ${manifest.start_time}\n`;
            
            // Labels and Annotations
            if (manifest.labels) {
                formattedOutput += `Labels:       ${Object.entries(manifest.labels).map(([k, v]) => `${k}=${v}`).join(', ')}\n`;
            }
            if (manifest.annotations) {
                formattedOutput += `Annotations:  ${Object.entries(manifest.annotations).map(([k, v]) => `${k}=${v}`).join(', ')}\n`;
            }
            
            // Status and IPs
            formattedOutput += `Status:       ${manifest.status}\n`;
            formattedOutput += `IP:           ${manifest.ip}\n`;
            if (manifest.ips) {
                formattedOutput += `IPs:          ${manifest.ips.join(', ')}\n`;
            }
            if (manifest.controlled_by) {
                formattedOutput += `Controlled By: ${manifest.controlled_by}\n`;
            }
            
            // Containers
            formattedOutput += '\nContainers:\n';
            manifest.containers.forEach(container => {
                formattedOutput += `  ${container.name}:\n`;
                formattedOutput += `    Container ID:  ${container.container_id || '<none>'}\n`;
                formattedOutput += `    Image:         ${container.image}\n`;
                formattedOutput += `    Image ID:      ${container.image_id || '<none>'}\n`;
                
                // Ports
                if (container.ports && container.ports.length > 0) {
                    formattedOutput += `    Port:          ${container.ports.map(p => `${p.container_port}/${p.protocol}`).join(', ')}\n`;
                } else {
                    formattedOutput += `    Port:          <none>\n`;
                }
                if (container.host_ports && container.host_ports.length > 0) {
                    formattedOutput += `    Host Port:     ${container.host_ports.map(p => `${p.host_port}/${p.protocol}`).join(', ')}\n`;
                } else {
                    formattedOutput += `    Host Port:     <none>\n`;
                }
                
                // Command and Args
                if (container.command) {
                    formattedOutput += `    Command:\n      ${container.command.join('\n      ')}\n`;
                }
                if (container.args) {
                    formattedOutput += `    Args:\n      ${container.args.join('\n      ')}\n`;
                }
                
                // State and Status
                formattedOutput += `    State:         ${container.state || '<none>'}\n`;
                formattedOutput += `    Ready:         ${container.ready}\n`;
                formattedOutput += `    Restart Count: ${container.restart_count}\n`;
                
                // Environment
                if (container.environment && container.environment.length > 0) {
                    formattedOutput += `    Environment:\n`;
                    container.environment.forEach(env => {
                        if (env.value) {
                            formattedOutput += `      ${env.name}=${env.value}\n`;
                        } else if (env.value_from) {
                            formattedOutput += `      ${env.name}=${env.value_from}\n`;
                        }
                    });
                }
                
                // Mounts
                if (container.mounts && container.mounts.length > 0) {
                    formattedOutput += `    Mounts:\n`;
                    container.mounts.forEach(mount => {
                        formattedOutput += `      ${mount.name} from ${mount.mount_path} (${mount.read_only ? 'ro' : 'rw'})\n`;
                    });
                }
                
                // Resources
                if (container.resources) {
                    formattedOutput += `    Resources:\n`;
                    if (container.resources.requests) {
                        formattedOutput += `      Requests:\n`;
                        Object.entries(container.resources.requests).forEach(([k, v]) => {
                            formattedOutput += `        ${k}: ${v}\n`;
                        });
                    }
                    if (container.resources.limits) {
                        formattedOutput += `      Limits:\n`;
                        Object.entries(container.resources.limits).forEach(([k, v]) => {
                            formattedOutput += `        ${k}: ${v}\n`;
                        });
                    }
                }
                formattedOutput += '\n';
            });
            
            // Volumes
            if (manifest.volumes && manifest.volumes.length > 0) {
                formattedOutput += 'Volumes:\n';
                manifest.volumes.forEach(volume => {
                    formattedOutput += `  ${volume.name}:\n`;
                    for (const [key, value] of Object.entries(volume)) {
                        if (key !== 'name' && value) {
                            formattedOutput += `    Type: ${key}\n`;
                            formattedOutput += `    ${value}\n`;
                        }
                    }
                });
            }

            describeContent.textContent = formattedOutput;
        }
    } catch (error) {
        console.error('Error loading pod details:', error);
        describeContent.textContent = 'Error loading pod details';
    } finally {
        hideSpinner();
    }
}

function closeDescribeModal() {
    describeModal.classList.add('hidden');
    describeContent.textContent = '';
}

async function copyToClipboard(elementId, event) {
    const element = document.getElementById(elementId);
    const text = element.textContent;
    const button = event.currentTarget;
    
    if (!button) {
        console.error('Button element not found');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(text);
        
        // Visual feedback
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.classList.remove('bg-gray-600', 'hover:bg-gray-700');
        button.classList.add('bg-green-600', 'hover:bg-green-700');
        
        // Reset button after 2 seconds
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('bg-green-600', 'hover:bg-green-700');
            button.classList.add('bg-gray-600', 'hover:bg-gray-700');
        }, 2000);
    } catch (error) {
        console.error('Error copying to clipboard:', error);
        alert('Failed to copy to clipboard');
    }
} 