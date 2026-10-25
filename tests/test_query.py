"""Tests for query building — pure logic, no network."""

import pytest

from swecc_oss_explorer.query import build_issue_query


class TestBuildIssueQuery:
    def test_default_is_open_issues(self):
        assert "is:issue" in build_issue_query() and "is:open" in build_issue_query()

    def test_no_repo_qualifiers_by_default(self):
        assert "repo:" not in build_issue_query(scope="top")
        assert "repo:" not in build_issue_query(scope="all")

    def test_labels_are_quoted(self):
        q = build_issue_query(labels=["good first issue"])
        assert 'label:"good first issue"' in q

    def test_language_and_text(self):
        q = build_issue_query(language="Python", text="pagination")
        assert "language:Python" in q and "pagination" in q

    def test_created_since_qualifier(self):
        q = build_issue_query(created_since="2026-08-24")
        assert "created:>=2026-08-24" in q

    def test_empty_created_since_is_omitted(self):
        assert "created:" not in build_issue_query(created_since=None)
        assert "created:" not in build_issue_query(created_since="")

    def test_created_since_counts_toward_char_budget(self):
        repos = [f"owner/repo-{i}" for i in range(50)]
        with pytest.raises(ValueError):
            build_issue_query(created_since="2026-08-24", repos=repos)

    def test_explicit_repos_are_included(self):
        q = build_issue_query(repos=["foo/bar"])
        assert "repo:foo/bar" in q

    def test_rejects_unknown_scope(self):
        with pytest.raises(ValueError):
            build_issue_query(scope="nope")

    def test_rejects_removed_swecc_scope(self):
        with pytest.raises(ValueError):
            build_issue_query(scope="swecc")

    def test_rejects_queries_over_256_chars(self):
        with pytest.raises(ValueError):
            build_issue_query(repos=[f"owner/repo-{i}" for i in range(50)])
