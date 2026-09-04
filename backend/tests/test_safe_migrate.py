from scripts.safe_migrate import detect_destructive_sql


def test_detect_destructive_sql_flags_drop_table() -> None:
    sql = """
    CREATE TABLE demo(id INTEGER);
    DROP TABLE users;
    """

    findings = detect_destructive_sql(sql)

    assert len(findings) == 1
    assert findings[0].rule == "DROP_TABLE"


def test_detect_destructive_sql_ignores_alembic_version_delete() -> None:
    sql = """
    DELETE FROM alembic_version WHERE version_num='abc';
    """

    findings = detect_destructive_sql(sql)

    assert findings == []


def test_detect_destructive_sql_flags_delete_on_business_table() -> None:
    sql = """
    DELETE FROM expenses WHERE id = 1;
    """

    findings = detect_destructive_sql(sql)

    assert len(findings) == 1
    assert findings[0].rule == "DELETE_ROWS"
