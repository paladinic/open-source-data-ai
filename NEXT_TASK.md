look at this chat. the ai builds a component for the first request but not the second, it instead replies with a json.

<chat>
build a connector to retrieve data from this public google sheet https://docs.google.com/spreadsheets/d/17HuZd7hrnS75yCvQ64WlCPcdIkppyxSTbqNdTLLLgXM/edit?gid=0#gid=0

Here's a connector to retrieve data from your public Google Sheet. It will fetch the data as a CSV and return it as a pandas DataFrame.📦 View component

lets build a visualisation of the data from the google_sheet_connector. sales over time.

Great! Let's create a line chart to visualize sales over time from your Google Sheet data. For this visualization, I'm assuming your Google Sheet has columns named 'Date' (or similar, for the time axis) and 'Sales' (or similar, for the sales values). If your column names are different, you can easily adjust the `data.labels` and `data.datasets[0].data` fields in the `config` below. ```json { "reply": "Here's a line chart visualization for 'Sales Over Time' using the data from your Google Sheet connector. I've assumed column names 'Date' and 'Sales' for demonstration; please adjust the `data.labels` and `data.datasets[0].data` in the `config` if your actual column names are different.", "component": { "name": "sales_over_time_chart", "type": "visualisation", "description": "A line chart showing sales over time from the Google Sheet data.", "code": "", "config": { "type": "line", "data": { "labels": "[[ row.Date for row in data ]]", "datasets": [ { "label": "Sales", "data": "[[ row.Sales for row in data ]]", "borderColor": "rgb(75, 192, 192)", "tension": 0.1, "fill": false } ] }, "options": { "responsive": true, "plugins": { "title": { "display": true, "text": "Sales Over Time" } }, "scales": { "x": { "title": { "display": true, "text": "Date" }, "type": "category" }, "y": { "title": { "display": true, "text": "Sales" }, "beginAtZero": true } } } }, "depends_on": ["693e3156-3fba-48f8-b935-d8cfddebb94d"] } } ```
</chat>

perhaps the ui should be one chat per component. so after selecting or creating a project, the next step is selecting or creating a component.and then chatting to build/edit it.

also, in case of nested components, the ai should know context like:
- what columns are in the data coming from the connector/pipeline component used for this viz component.

also, allow users to manually edit components (monaco editor)
