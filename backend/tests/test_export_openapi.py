from scripts.export_openapi import export_openapi_schema


def test_export_openapi_schema_includes_expected_paths() -> None:
    schema = export_openapi_schema()

    assert "/health" in schema["paths"]
    assert "/api/v1/ping" in schema["paths"]
