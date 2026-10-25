"""Tests for the GitHub client and discovery — network calls are mocked."""

import pytest

from swecc_oss_explorer.discovery import discover, repo_full_names, swecc_repos, top_active_repos
from swecc_oss_explorer.github import GitHubClient, GitHubError, RateLimitError


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = text or str(self._payload)

    def json(self):
        return self._payload


class FakeSession:
    """Records requests; returns canned responses keyed by path."""

    def __init__(self, responses):
        self.responses = responses  # list of (path_prefix, FakeResponse)
        self.calls = []
        self.headers = {}

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        for i, (prefix, resp) in enumerate(self.responses):
            if prefix in url:
                self.responses.pop(i)  # responses are consumed in order
                return resp
        return FakeResponse(200, {})


def make_client(responses):
    client = GitHubClient(token="test-token")
    fake = FakeSession(responses)
    fake.headers = client.session.headers  # carry over headers set in __init__
    client.session = fake
    return client


# ---------- GitHubClient ----------

def test_search_issues_returns_items():
    payload = {"items": [{"id": 1}], "total_count": 1}
    client = make_client([("/search/issues", FakeResponse(200, payload))])
    assert client.search_issues("is:issue") == [{"id": 1}]


def test_rate_limit_raises_specific_error():
    client = make_client([("/search", FakeResponse(403, {}, text="API rate limit exceeded"))])
    with pytest.raises(RateLimitError):
        client.search_issues("is:issue")


def test_422_raises_github_error():
    client = make_client([("/search", FakeResponse(422, {"message": "query is too long"}))])
    with pytest.raises(GitHubError):
        client.search_issues("x" * 300)


def test_token_from_argument_sets_auth_header():
    client = make_client([])
    assert client.session.headers["Authorization"] == "Bearer test-token"


# ---------- discovery ----------

def test_swecc_repos_excludes_archived_and_sorts_by_stars():
    client = make_client([(
        "/orgs/swecc-uw/repos",
        FakeResponse(200, [
            {"full_name": "swecc-uw/a", "stargazers_count": 3, "archived": False},
            {"full_name": "swecc-uw/b", "stargazers_count": 9, "archived": False},
            {"full_name": "swecc-uw/old", "stargazers_count": 50, "archived": True},
        ]),
    )])
    names = [r["full_name"] for r in swecc_repos(client)]
    assert names == ["swecc-uw/b", "swecc-uw/a"]


def test_top_active_repos_uses_pushed_recently_query():
    payload = {"items": [], "total_count": 0}
    client = make_client([("/search/repositories", FakeResponse(200, payload))])
    top_active_repos(client, limit=10)
    url, params = client.session.calls[0]
    assert "pushed:>=" in params["q"] and "stars:>5000" in params["q"]
    assert params["sort"] == "stars" and params["per_page"] == 10


def test_discover_all_returns_empty():
    client = make_client([])
    assert discover(client, "all") == []


def test_repo_full_names():
    assert repo_full_names([{"full_name": "a/b"}, {"full_name": ""}]) == {"a/b"}
