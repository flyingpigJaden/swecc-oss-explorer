"""Tests for the human-friendly age parser and date helper."""

import pytest

from swecc_oss_explorer.timeutil import days_ago_iso, parse_age


class TestParseAge:
    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("30d", 30),
            ("2w", 14),
            ("3mo", 90),
            ("1y", 365),
            ("2MO", 60),      # case-insensitive
            (" 14 d ", 14),   # whitespace
            ("10m", 300),     # m treated as months
        ],
    )
    def test_valid_specs(self, text, expected):
        assert parse_age(text) == expected

    @pytest.mark.parametrize("text", ["any", "all", "none", "0", ""])
    def test_no_limit_values(self, text):
        assert parse_age(text) is None

    @pytest.mark.parametrize("text", ["2", "d30", "2x", "-5d", "2 months", "fortnight"])
    def test_invalid_specs(self, text):
        with pytest.raises(ValueError):
            parse_age(text)


def test_days_ago_iso_format():
    iso = days_ago_iso(61)
    assert len(iso) == 10 and iso.count("-") == 2
    assert iso < days_ago_iso(1)  # older date sorts before recent one
