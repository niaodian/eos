# Trace matrix

The human decision: which test proves which acceptance criterion. Whether it ran — and passed, on
this tree — is not written here: the verified gate answers each row from the JUnit reports the run
wrote, into docs/evidence/test-run.json.

| AC | Test | Result |
| --- | --- | --- |
| AC1.1 | tests/login.test.mjs::valid password logs the user in | from the run |
| AC1.2 | tests/test_logout.py::test_logout_destroys_the_session | from the run |
