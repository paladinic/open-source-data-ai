ERROR:

Traceback (most recent call last):
  File "C:\Users\claud\Documents\GitHub\open-source-data-ai\backend\core\executor.py", line 103, in _run_component
    result = namespace["run"](resolved_inputs)
  File "<time_series>", line 2, in run
KeyError: 'sales_spend_gsheet'

CODE:

def run(inputs: dict) -> dict:
    data = inputs['sales_spend_gsheet']

    dates = [row['date'] for row in data]
    sales_data = [row['sales'] for row in data]
    marketing_data = [row['marketing'] for row in data]

    return {
        'type': 'line',
        'data': {
            'labels': dates,
            'datasets': [
                {
                    'label': 'Sales',
                    'data': sales_data,
                    'borderColor': 'rgb(75, 192, 192)',
                    'tension': 0.1,
                    'fill': False
                },
                {
                    'label': 'Marketing',
                    'data': marketing_data,
                    'borderColor': 'rgb(255, 99, 132)',
                    'tension': 0.1,
                    'fill': False
                }
            ]
        },
        'options': {
            'responsive': True,
            'plugins': {
                'title': {
                    'display': True,
                    'text': 'Sales and Marketing Spend Over Time'
                }
            },
            'scales': {
                'x': {
                    'type': 'time',
                    'time': {
                        'parser': 'M/D/YY',
                        'unit': 'month',
                        'tooltipFormat': 'MMM D, yyyy'
                    },
                    'title': {
                        'display': True,
                        'text': 'Date'
                    }
                },
                'y': {
                    'title': {
                        'display': True,
                        'text': 'Amount'
                    }
                }
            }
        }
    }

CHAT:

@sales_spend_gsheet both variables as lines over time
I've created a line chart visualization showing 'sales' and 'marketing' trends over time using the data from `sales_spend_gsheet`. Each variable is plotted as a separate line. *(auto-corrected 1 error)*
check the date format
The chart is currently configured to parse dates from your `sales_spend_gsheet` component in `YYYY-MM-DD` format. It then displays them by month on the x-axis, with tooltips formatted as `MMM D, YYYY`. This setup is correct if the 'date' column in your `sales_spend_gsheet` data is indeed in `YYYY-MM-DD` format (e.g., '2023-01-15'). If your dates are in a different format, please let me know and I can adjust the `parser` accordingly.
getting Chart error: Use `yyyy` instead of `YYYY` (in `YYYY-MM-DD`) for formatting years to the input `1/1/15`; see: https://git.io/fxCyr
I've updated the chart configuration to correctly parse dates in `M/D/YY` format and use `yyyy` in the tooltip format to resolve the error.