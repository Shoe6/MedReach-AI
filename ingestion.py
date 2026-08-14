import tracemalloc
from typing import Any

import pandas as pd


def ingest_csv_chunks(file_obj) -> dict[str, Any]:
    """Read a CSV in 5K-row chunks, track chunked memory usage, and summarize the file."""
    tracemalloc.start()
    total_rows = 0
    columns = []
    preview_data = []
    first_chunk = True

    try:
        for chunk in pd.read_csv(file_obj, chunksize=5000):
            if first_chunk:
                columns = list(chunk.columns)
                preview_data = chunk.head(5).to_dict(orient="records")
                first_chunk = False

            total_rows += len(chunk)
    finally:
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

    return {
        "total_rows": total_rows,
        "columns": columns,
        "preview_data": preview_data,
        "peak_memory_mb": round(peak / (1024 * 1024), 4),
    }
