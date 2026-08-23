import json
from pathlib import Path
from typing import Any

from app.main import app

OUTPUT_PATH = Path(__file__).resolve().parents[2] / "openapi" / "openapi.json"


def export_openapi_schema() -> dict[str, Any]:
    return app.openapi()


def main() -> None:
    schema = export_openapi_schema()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
