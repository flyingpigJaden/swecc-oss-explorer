"""Tests for query building — pure logic, no network."""

import pytest

from swecc_oss_explorer.query import build_issue_query, filter_by_repos


class TestBuildIssueQuery:
    def test_default_is_open_issues(self):
        assert "is:issue" in build_issue_query() and "is:open" in build_issue_query()

    def test_swecc_scope_uses_org_qualifier(self):
        assert "org:swecc-uw" in build_issue_query(scope="swecc")

    def test_top_scope_does_not_add_repo_qualifiers(self):
        assert "repo:" not in build_issue_query(scope="top")

    def test_labels_are_quoted(self):
        q = build_issue_query(labels=["good first issue"])
        assert 'label:"good first issue"' in q

    def test_language_and_text(self):
        q = build_issue_query(language="Python", text="pagination")
        assert "language:Python" in q and "pagination" in q

    def test_explicit_repos_override_scope(self):
        q = build_issue_query(repos=["foo/bar"])
        assert "repo:foo/bar" in q

    def test_rejects_unknown_scope(self):
        with pytest.raises(ValueError):
            build_issue_query(scope="nope")

    def test_rejects_queries_over_256_chars(self):
        with pytest.raises(ValueError):
            build_issue_query(repos=[f"owner/repo-{i}" for i in range(50)])


class TestFilterByRepos:
    def test_keeps_only_allowed_repos(self):
        items = [
            {"repository_url": "https://api.github.com/repos/a/one"},
            {"repository_url": "https://api.github.com/repos/b/two"},
        ]
        kept = filter_by_repos(items, {"a/one"})
        assert [i["repository_url"] for i in kept] == ["https://api.github.com/repos/a/one"]

    def test_empty_allowlist_keeps_everything(self):
        items = [{"repository_url": "https://api.github.com/repos/a/one"}]
        assert filter_by_repos(items, set()) == items
