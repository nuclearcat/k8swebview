# Kubernetes Pod Viewer

A web application that displays Kubernetes pods from all available contexts and namespaces, with the ability to view pod logs/describe info.

## Features

- View all available Kubernetes contexts
- List pods from all namespaces for each context
- View pod logs in a modal window
- Modern, responsive UI with Tailwind CSS
- Real-time pod status indicators

## Prerequisites

- Python 3.7+
- Kubernetes configuration file (`~/.kube/config`)
- Access to Kubernetes clusters

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd k8swebview
```

2. Create a virtual environment and activate it:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

## Usage

1. Start the application:
```bash
python main.py
```

2. Open your web browser and navigate to:
```
http://localhost:8000
```

3. Select a Kubernetes context from the dropdown menu to view pods
4. Click "View Logs" on any pod to see its logs

## Project Structure

```
.
├── main.py              # FastAPI application
├── requirements.txt     # Python dependencies
├── static/
│   ├── style.css       # Custom styles
│   └── script.js       # Frontend JavaScript
└── templates/
    └── index.html      # Main page template
```

## API Endpoints

- `GET /api/contexts` - Get all available Kubernetes contexts
- `GET /api/pods/{context}` - Get pods for a specific context
- `GET /api/logs/{context}/{namespace}/{pod}` - Get logs for a specific pod

## License

LGPL-2.1
