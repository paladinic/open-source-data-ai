# Open-source Business-intelligence AI

An API & MCP that allows users to build data apps with natural language.
Users build components that make up the infrastructure of their data project.

## Installation
The steps below set you up to run the _lite_ version of BI-Studio, and give you everything you need to upgrade to the full version.

1. Clone
```bash
git clone https://github.com/paladinic/open-source-data-ai.git
```

2. Create `venv`
```bash
# Create the virtual environment
python -m venv venv

# Activate on Windows (Command Prompt)
venv\Scripts\activate

# OR Activate on Windows (PowerShell)
. \venv\Scripts\Activate.ps1

# OR Activate on macOS/Linux
source venv/bin/activate

```

3. Install `requirements-lite.txt`
```bash
pip install -r requirements-lite.txt
```

4. Run
```bash
python run_lite.py
```

## User Journey

1. Start Project (e.g. company marketing analytics dashboard)
2. Set up Data Sources (e.g. Oauth for the usual data warehouses)
3. Build pipelines (e.g. getting media spending data and sales revenue data overtime, into one table)
4. Build visualisation (e.g. get table X and show me total spend and revenue over time)
5. Build apps (drag and drop pre-built visualisations)

## Components

Users can use the chat based interface to create and edit components, that are stored for later use. These can be combined and nested to build pipelines and dashboards that are robust, auditable, and completely modular.

The types of components are:
- **ETL**: Accessing and processing data.
- **Modelling**: Running ML models with data from ETL components.
- **Visualisation**: Building visualisations that can be combined later into a dashboard.
- **Code**: Functions to be used in various components to avoid repetition.
