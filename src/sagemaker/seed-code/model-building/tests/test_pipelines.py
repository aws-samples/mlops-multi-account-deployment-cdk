import pytest


@pytest.mark.xfail
def test_that_you_wrote_tests():
    assert False, "No tests written"  # nosec # nosem - sample code provided by AWS service team


def test_pipelines_importable():
    import pipelines  # noqa: F401
