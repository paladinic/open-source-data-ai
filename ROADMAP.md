errors displayed in editor
- Can they be problematic? do they actually show what the user needs and should see?
- example:
        Traceback (most recent call last):
        File "C:\Users\claud\Documents\GitHub\open-source-data-ai\backend\core\executor.py", line 225, in _run_component
            result = _exec_cells(sources, namespace, resolved_inputs)
        File "C:\Users\claud\Documents\GitHub\open-source-data-ai\backend\core\executor.py", line 178, in _exec_cells
            exec(compile(preamble, "<cell>", "exec"), namespace)  # noqa: S102
            ~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        File "<cell>", line 4, in <module>
        KeyError: 'clean_data'

export data 
- as csv, excel...

export notebooks
- export component notebook with dependencies so the user gets a single, working notebook with all the data ingestion, transformation, visualisations that are part of the pipeline they are downloading

new users 
- add a tour of the platform using drvier.js or similar  





opensource docs
- installation

dashboard sharing
- allow users to share dashboard as public or restricted

collaborating


store cell outputs
- save cell outputs. at the moment re-opening a component i just ran  shows me blank outputs

connectors
- airbyte

paid version
- auth
- hosting
- stripe
- ai models and quotas
- computes