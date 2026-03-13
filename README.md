# Open-source Business-intelligence AI

An API & MCP that allows users to build data apps with natural language.
Users build components that make up the infrastructure of their data project.

## User Journey

1. Start Project (e.g. company marketing analytics dashboard)
2. Set up Data Sources (e.g. Oauth for the usual data warehouses)
3. Build pipelines (e.g. getting media spending data and sales revenue data overtime, into one table)
4. Build visualisation (e.g. get table X and show me total spend and revenue over time)
5. Build apps (drag and drop pre-built visualisations)

## Components

Users can use the chat based interface to build and edit components, that are stored for later use. These can be combined and nested, like functions.

The types of components are:
- Data connectors
- Pipelines
- Visualisation

Under the hood components are just pieces of code. 

### Data connectors

#### Example 1

USER:
- "set up a connection to Bigquery table X"
AI:
- "cool, i need xyz to grant you access"
USER:
- provides credentials
AI:
- "cool, with these credentials we can start accessing data. I have stored the connector component for later use."

### Pipelines

#### Example 1 

USER:
- "i want to retrieve data from BQ to show sales revenue and marketing spend over time"
AI:
- "cool, I will use the BQ connector. I have stored the pipeline component which retrieves the requested data."

#### Example 2

USER:
- "i want to run a regression model on sales revenue and marketing spend"
AI:
- "cool, shall i use the table from this component?"
- shows table output head
USER:
- "yes"
AI:
- "I will use the pipeline component to retrieve the data and run the model. I have stored the pipeline component which runs the requested model and outputs the model object."

### Visualisation

#### Example 1 

USER:
- "i want to visualise revenue and marketing spend over time"
AI:
- "cool, I will use the pipeline component to retrieve the data. I have stored the visualisation component which displays the requested chart."

## Tech Stack

- Python backend (for routing and pipeline code)
- JS frontend (vanilla + bootstrap + chart.js for visualisations)
- Local storage (temporary for dev)