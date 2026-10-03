# AC1.2 — pytest. `--junitxml` writes the report; see project.json.
SESSIONS = {"abc": "alice"}


def logout(session):
    return SESSIONS.pop(session, None) is not None


def test_logout_destroys_the_session():
    assert logout("abc")
    assert "abc" not in SESSIONS
