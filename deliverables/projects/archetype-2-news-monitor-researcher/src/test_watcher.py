"""Unit tests for watcher.py — run with: pytest src/test_watcher.py"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent))
import watcher


class TestParseJsonResponse(unittest.TestCase):
    def test_plain_json(self):
        raw = '{"relevant": []}'
        result = watcher._parse_json_response(raw)
        self.assertEqual(result, {"relevant": []})

    def test_strips_markdown_fence(self):
        raw = "```\n{\"relevant\": []}\n```"
        result = watcher._parse_json_response(raw)
        self.assertEqual(result, {"relevant": []})

    def test_strips_json_language_fence(self):
        raw = "```json\n{\"relevant\": [1, 2]}\n```"
        result = watcher._parse_json_response(raw)
        self.assertEqual(result, {"relevant": [1, 2]})


class TestBuildLlmClient(unittest.TestCase):
    def test_defaults_to_anthropic(self):
        config = {}
        env = {"ANTHROPIC_API_KEY": "test-key"}
        with patch.dict(os.environ, env, clear=False):
            os.environ.pop("AI_PROVIDER", None)
            os.environ.pop("OPENAI_API_KEY", None)
            client, provider, model = watcher.build_llm_client(config)
        self.assertEqual(provider, "anthropic")
        self.assertEqual(model, "claude-sonnet-4-6")

    def test_config_ai_provider_openai(self):
        config = {"ai_provider": "openai"}
        env = {"OPENAI_API_KEY": "sk-test", "AI_PROVIDER": "openai"}
        with patch.dict(os.environ, env, clear=False):
            client, provider, model = watcher.build_llm_client(config)
        self.assertEqual(provider, "openai")
        self.assertEqual(model, "gpt-4o")

    def test_env_overrides_config_provider(self):
        config = {"ai_provider": "anthropic"}
        env = {"AI_PROVIDER": "openai", "OPENAI_API_KEY": "sk-test"}
        with patch.dict(os.environ, env, clear=False):
            client, provider, model = watcher.build_llm_client(config)
        self.assertEqual(provider, "openai")

    def test_ai_model_env_override(self):
        config = {}
        env = {"ANTHROPIC_API_KEY": "test-key", "AI_MODEL": "claude-opus-5", "AI_PROVIDER": "anthropic"}
        with patch.dict(os.environ, env, clear=False):
            client, provider, model = watcher.build_llm_client(config)
        self.assertEqual(model, "claude-opus-5")

    def test_config_ai_model_override(self):
        config = {"ai_model": "gpt-4o-mini", "ai_provider": "openai"}
        env = {"OPENAI_API_KEY": "sk-test", "AI_PROVIDER": "openai"}
        with patch.dict(os.environ, env, clear=False):
            os.environ.pop("AI_MODEL", None)
            client, provider, model = watcher.build_llm_client(config)
        self.assertEqual(model, "gpt-4o-mini")

    def test_missing_anthropic_key_exits(self):
        config = {}
        env = {"AI_PROVIDER": "anthropic"}
        with patch.dict(os.environ, env, clear=False):
            os.environ.pop("ANTHROPIC_API_KEY", None)
            with self.assertRaises(SystemExit):
                watcher.build_llm_client(config)

    def test_missing_openai_key_exits(self):
        config = {}
        env = {"AI_PROVIDER": "openai"}
        with patch.dict(os.environ, env, clear=False):
            os.environ.pop("OPENAI_API_KEY", None)
            with self.assertRaises(SystemExit):
                watcher.build_llm_client(config)

    def test_config_ai_provider_vercel(self):
        config = {"ai_provider": "vercel"}
        env = {"AI_GATEWAY_API_KEY": "vck-test", "AI_PROVIDER": "vercel"}
        with patch.dict(os.environ, env, clear=False):
            client, provider, model = watcher.build_llm_client(config)
        self.assertEqual(provider, "vercel")
        self.assertEqual(model, "anthropic/claude-sonnet-4-6")
        self.assertEqual(client.base_url.host, "ai-gateway.vercel.sh")

    def test_missing_vercel_key_exits(self):
        config = {}
        env = {"AI_PROVIDER": "vercel"}
        with patch.dict(os.environ, env, clear=False):
            os.environ.pop("AI_GATEWAY_API_KEY", None)
            with self.assertRaises(SystemExit):
                watcher.build_llm_client(config)


class TestCreateGithubIssue(unittest.TestCase):
    def _make_relevant(self):
        return [
            {
                "title": "Test Article",
                "url": "https://example.com/article",
                "source": "Test Source",
                "published": "2025-05-20",
                "relevance_score": 9,
                "explanation": "This is relevant because...",
            }
        ]

    def test_creates_issue_with_correct_title(self):
        relevant = self._make_relevant()
        config = {"thesis": "Test thesis", "github_issues": {"assignee": "testowner", "labels": ["digest"]}}
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"html_url": "https://github.com/testowner/repo/issues/1"}

        with patch("requests.post", return_value=mock_resp) as mock_post:
            url = watcher.create_github_issue(relevant, config, "token", "testowner/repo", "2025-05-20")

        self.assertEqual(url, "https://github.com/testowner/repo/issues/1")
        call_payload = mock_post.call_args[1]["json"]
        self.assertEqual(call_payload["title"], "Daily digest — 2025-05-20")
        self.assertIn("testowner", call_payload["assignees"])
        self.assertIn("digest", call_payload["labels"])

    def test_issue_body_contains_article(self):
        relevant = self._make_relevant()
        config = {"thesis": "Test thesis", "github_issues": {}}
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"html_url": "https://github.com/owner/repo/issues/2"}

        with patch("requests.post", return_value=mock_resp) as mock_post:
            watcher.create_github_issue(relevant, config, "token", "owner/repo", "2025-05-20")

        body = mock_post.call_args[1]["json"]["body"]
        self.assertIn("Test Article", body)
        self.assertIn("https://example.com/article", body)
        self.assertIn("9/10", body)

    def test_defaults_assignee_to_repo_owner(self):
        relevant = self._make_relevant()
        config = {"thesis": "t", "github_issues": {}}
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"html_url": "https://github.com/myorg/repo/issues/3"}

        with patch("requests.post", return_value=mock_resp) as mock_post:
            watcher.create_github_issue(relevant, config, "token", "myorg/repo", "2025-05-20")

        self.assertIn("myorg", mock_post.call_args[1]["json"]["assignees"])

    def test_returns_none_on_http_error(self):
        relevant = self._make_relevant()
        config = {"thesis": "t", "github_issues": {}}
        mock_resp = MagicMock()
        mock_resp.status_code = 422
        mock_resp.text = "Validation failed"

        import requests as req
        with patch("requests.post", side_effect=req.exceptions.HTTPError(response=mock_resp)):
            result = watcher.create_github_issue(relevant, config, "token", "owner/repo", "2025-05-20")

        self.assertIsNone(result)


class TestResearchState(unittest.TestCase):
    def test_load_initializes_when_missing(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "subdir", "state.json")
            state = watcher._load_research_state(path, "My hypothesis")
        self.assertEqual(state["hypothesis"], "My hypothesis")
        self.assertEqual(state["claims"], [])
        self.assertIsNone(state["last_updated"])

    def test_load_returns_existing_state(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "state.json")
            existing = {
                "hypothesis": "H",
                "position_summary": "Mixed evidence.",
                "claims": [{"claim": "Claim A", "stance": "supports"}],
                "last_updated": "2025-05-01T00:00:00+00:00",
            }
            with open(path, "w") as f:
                json.dump(existing, f)

            state = watcher._load_research_state(path, "H")

        self.assertEqual(len(state["claims"]), 1)
        self.assertEqual(state["position_summary"], "Mixed evidence.")

    def test_save_creates_directories(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "nested", "deep", "state.json")
            state = {"hypothesis": "H", "claims": [], "position_summary": "s", "last_updated": None}
            watcher._save_research_state(state, path)
            self.assertTrue(os.path.exists(path))
            with open(path) as f:
                loaded = json.load(f)
            self.assertEqual(loaded["hypothesis"], "H")

    def test_save_and_load_round_trip(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "state.json")
            state = {
                "hypothesis": "H",
                "position_summary": "Strongly supported.",
                "claims": [{"claim": "X supports H", "stance": "supports", "evidence": "..."}],
                "last_updated": "2025-05-20T09:00:00+00:00",
            }
            watcher._save_research_state(state, path)
            loaded = watcher._load_research_state(path, "H")
        self.assertEqual(loaded["position_summary"], "Strongly supported.")
        self.assertEqual(len(loaded["claims"]), 1)


class TestExtractClaims(unittest.TestCase):
    def _article(self):
        return {
            "title": "Structured content improves RAG accuracy",
            "url": "https://example.com/paper",
            "source": "arXiv",
            "published": "2025-05-20",
        }

    def test_returns_claims_with_metadata(self):
        llm_response = json.dumps({
            "claims": [
                {"claim": "XML-tagged docs reduce hallucination by 30%", "stance": "supports", "evidence": "Study found..."}
            ]
        })
        client = MagicMock()
        with patch.object(watcher, "_call_llm", return_value=llm_response):
            claims = watcher._extract_claims(self._article(), "My hypothesis", "article text", client, "anthropic", "claude-sonnet-4-6")

        self.assertEqual(len(claims), 1)
        self.assertEqual(claims[0]["stance"], "supports")
        self.assertEqual(claims[0]["article_title"], "Structured content improves RAG accuracy")
        self.assertIn("date", claims[0])

    def test_handles_empty_claims(self):
        llm_response = json.dumps({"claims": []})
        client = MagicMock()
        with patch.object(watcher, "_call_llm", return_value=llm_response):
            claims = watcher._extract_claims(self._article(), "My hypothesis", "unrelated text", client, "openai", "gpt-4o")

        self.assertEqual(claims, [])

    def test_handles_fenced_json_response(self):
        llm_response = '```json\n{"claims": [{"claim": "C", "stance": "contradicts", "evidence": "E"}]}\n```'
        client = MagicMock()
        with patch.object(watcher, "_call_llm", return_value=llm_response):
            claims = watcher._extract_claims(self._article(), "H", "text", client, "anthropic", "claude-sonnet-4-6")

        self.assertEqual(claims[0]["stance"], "contradicts")


class TestUpdatePositionSummary(unittest.TestCase):
    def test_returns_llm_output(self):
        state = {
            "hypothesis": "H",
            "position_summary": "Old summary.",
            "claims": [{"claim": "X", "stance": "supports", "evidence": "..."}],
        }
        client = MagicMock()
        with patch.object(watcher, "_call_llm", return_value="New synthesized summary."):
            result = watcher._update_position_summary(state, client, "anthropic", "claude-sonnet-4-6")

        self.assertEqual(result, "New synthesized summary.")

    def test_returns_placeholder_when_no_claims(self):
        state = {"hypothesis": "H", "position_summary": "", "claims": []}
        client = MagicMock()
        result = watcher._update_position_summary(state, client, "anthropic", "claude-sonnet-4-6")
        self.assertIn("No claims", result)


class TestEvaluateRelevance(unittest.TestCase):
    def _config(self):
        return {
            "thesis": "T",
            "keywords": ["keyword"],
            "themes": ["theme"],
            "min_relevance_score": 6,
        }

    def test_scores_and_attaches_to_articles(self):
        articles = [
            {"source": "S", "title": "Title A", "url": "https://a.com", "summary": "...", "published": "2025-05-20"},
            {"source": "S", "title": "Title B", "url": "https://b.com", "summary": "...", "published": "2025-05-20"},
        ]
        llm_response = json.dumps({
            "relevant": [
                {"id": 0, "relevance_score": 9, "explanation": "Very relevant"},
                {"id": 1, "relevance_score": 7, "explanation": "Somewhat relevant"},
            ]
        })
        client = MagicMock()
        with patch.object(watcher, "_call_llm", return_value=llm_response):
            results = watcher.evaluate_relevance(articles, self._config(), client, "anthropic", "claude-sonnet-4-6")

        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["relevance_score"], 9)
        self.assertEqual(results[0]["title"], "Title A")
        # sorted highest first
        self.assertGreaterEqual(results[0]["relevance_score"], results[1]["relevance_score"])

    def test_filters_by_min_score(self):
        # The LLM already filters; watcher passes the threshold in the prompt.
        # If LLM returns only one result, only one should come back.
        articles = [
            {"source": "S", "title": "A", "url": "u", "summary": "s", "published": "d"},
        ]
        llm_response = json.dumps({"relevant": [{"id": 0, "relevance_score": 8, "explanation": "ok"}]})
        client = MagicMock()
        with patch.object(watcher, "_call_llm", return_value=llm_response):
            results = watcher.evaluate_relevance(articles, self._config(), client, "openai", "gpt-4o")

        self.assertEqual(len(results), 1)

    def test_returns_empty_when_nothing_relevant(self):
        articles = [{"source": "S", "title": "X", "url": "u", "summary": "s", "published": "d"}]
        llm_response = json.dumps({"relevant": []})
        client = MagicMock()
        with patch.object(watcher, "_call_llm", return_value=llm_response):
            results = watcher.evaluate_relevance(articles, self._config(), client, "anthropic", "claude-sonnet-4-6")

        self.assertEqual(results, [])


class TestRunResearchMode(unittest.TestCase):
    def _config(self, hypothesis="Test hypothesis", state_file=None):
        return {
            "research_mode": {
                "hypothesis": hypothesis,
                "state_file": state_file or "research/state.json",
            }
        }

    def _relevant(self):
        return [{"title": "T", "url": "https://example.com", "source": "S", "published": "2025-05-20", "relevance_score": 9, "explanation": "e"}]

    def test_skips_when_no_hypothesis(self):
        config = {"research_mode": {"hypothesis": "", "state_file": "research/state.json"}}
        client = MagicMock()
        with patch.object(watcher, "fetch_article_content") as mock_fetch:
            watcher.run_research_mode(self._relevant(), config, client, "anthropic", "model")
        mock_fetch.assert_not_called()

    def test_saves_state_when_claims_found(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = os.path.join(tmpdir, "state.json")
            config = self._config(state_file=state_file)

            claim_response = json.dumps({
                "claims": [{"claim": "Structured content helps", "stance": "supports", "evidence": "Study shows..."}]
            })
            summary_response = "Updated position summary text."

            client = MagicMock()
            with (
                patch.object(watcher, "fetch_article_content", return_value="article body"),
                patch.object(watcher, "_call_llm", side_effect=[claim_response, summary_response]),
            ):
                watcher.run_research_mode(self._relevant(), config, client, "anthropic", "model")

            self.assertTrue(os.path.exists(state_file))
            with open(state_file) as f:
                saved = json.load(f)
            self.assertEqual(len(saved["claims"]), 1)
            self.assertEqual(saved["position_summary"], "Updated position summary text.")
            self.assertIsNotNone(saved["last_updated"])

    def test_initializes_file_on_first_run_even_with_no_claims(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = os.path.join(tmpdir, "nested", "state.json")
            config = self._config(state_file=state_file)
            claim_response = json.dumps({"claims": []})

            client = MagicMock()
            with (
                patch.object(watcher, "fetch_article_content", return_value="article body"),
                patch.object(watcher, "_call_llm", return_value=claim_response),
            ):
                watcher.run_research_mode(self._relevant(), config, client, "anthropic", "model")

            self.assertTrue(os.path.exists(state_file))
            with open(state_file) as f:
                saved = json.load(f)
            self.assertEqual(saved["claims"], [])
            self.assertEqual(saved["hypothesis"], "Test hypothesis")

    def test_does_not_overwrite_existing_file_when_no_claims(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = os.path.join(tmpdir, "state.json")
            config = self._config(state_file=state_file)

            # Pre-populate with existing state
            existing = {
                "hypothesis": "Test hypothesis",
                "position_summary": "Prior summary.",
                "claims": [{"claim": "Old claim", "stance": "supports", "evidence": "..."}],
                "last_updated": "2025-05-01T00:00:00+00:00",
            }
            with open(state_file, "w") as f:
                json.dump(existing, f)

            mtime_before = os.path.getmtime(state_file)
            claim_response = json.dumps({"claims": []})

            client = MagicMock()
            with (
                patch.object(watcher, "fetch_article_content", return_value="article body"),
                patch.object(watcher, "_call_llm", return_value=claim_response),
            ):
                watcher.run_research_mode(self._relevant(), config, client, "anthropic", "model")

            mtime_after = os.path.getmtime(state_file)
            self.assertEqual(mtime_before, mtime_after)  # file untouched

    def test_continues_after_fetch_error(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = os.path.join(tmpdir, "state.json")
            config = self._config(state_file=state_file)

            client = MagicMock()
            with patch.object(watcher, "fetch_article_content", side_effect=Exception("network error")):
                # Should not raise
                watcher.run_research_mode(self._relevant(), config, client, "anthropic", "model")


class TestOutputRouting(unittest.TestCase):
    """Test that Slack, GitHub Issues, and Research Mode are each independently optional.

    Uses a self-contained config written to a temp file so the tests never depend
    on whichever output flags happen to be set in the real config under config/.
    """

    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self.config_path = os.path.join(self._tmpdir.name, "config.json")
        config = {
            "name": "Test Watcher",
            "thesis": "test thesis",
            "keywords": ["kw"],
            "themes": ["theme"],
            "min_relevance_score": 6,
            "notify_on_empty": False,
            "publications": [{"name": "S", "rss_url": "https://example.com/feed"}],
            "github_issues": {"enabled": False},
            "research_mode": {
                "enabled": False,
                "hypothesis": "test hypothesis",
                "state_file": os.path.join(self._tmpdir.name, "state.json"),
            },
        }
        with open(self.config_path, "w") as f:
            json.dump(config, f)

    def _base_env(self, **overrides):
        env = {
            "CONFIG_PATH": self.config_path,
            "ANTHROPIC_API_KEY": "test-key",
            "AI_PROVIDER": "anthropic",
            "LOOKBACK_HOURS": "24",
            "GITHUB_REPOSITORY": "owner/repo",
            "GITHUB_TOKEN": "gh-token",
        }
        env.update(overrides)
        # Ensure optional outputs are off unless explicitly set
        env.setdefault("SLACK_WEBHOOK_URL", "")
        env.setdefault("SAVE_AS_GITHUB_ISSUE", "false")
        env.setdefault("RESEARCH_MODE", "false")
        return env

    def _run_main(self, env, relevant=None, all_articles=None):
        """Run main() with mocked LLM, fetching, and output sinks."""
        if relevant is None:
            relevant = [{"title": "T", "url": "https://example.com", "source": "S",
                         "published": "2025-05-20", "relevance_score": 9, "explanation": "e"}]
        if all_articles is None:
            all_articles = [{"source": "S", "title": "T", "url": "https://example.com",
                             "summary": "s", "published": "2025-05-20"}]

        mock_client = MagicMock()
        with (
            patch.dict(os.environ, env, clear=True),
            patch.object(watcher, "build_llm_client", return_value=(mock_client, "anthropic", "claude-sonnet-4-6")),
            patch.object(watcher, "fetch_articles", return_value=all_articles),
            patch.object(watcher, "evaluate_relevance", return_value=relevant),
            patch.object(watcher, "post_to_slack") as mock_slack,
            patch.object(watcher, "create_github_issue", return_value="https://github.com/owner/repo/issues/1") as mock_issue,
            patch.object(watcher, "run_research_mode") as mock_research,
        ):
            watcher.main()
            return mock_slack, mock_issue, mock_research

    def test_slack_only(self):
        env = self._base_env(SLACK_WEBHOOK_URL="https://hooks.slack.com/x")
        mock_slack, mock_issue, mock_research = self._run_main(env)
        mock_slack.assert_called_once()
        mock_issue.assert_not_called()
        mock_research.assert_not_called()

    def test_research_mode_only_no_slack(self):
        env = self._base_env(RESEARCH_MODE="true")
        mock_slack, mock_issue, mock_research = self._run_main(env)
        mock_slack.assert_not_called()
        mock_issue.assert_not_called()
        mock_research.assert_called_once()

    def test_github_issues_only_no_slack(self):
        env = self._base_env(SAVE_AS_GITHUB_ISSUE="true")
        mock_slack, mock_issue, mock_research = self._run_main(env)
        mock_slack.assert_not_called()
        mock_issue.assert_called_once()
        mock_research.assert_not_called()

    def test_all_outputs_together(self):
        env = self._base_env(
            SLACK_WEBHOOK_URL="https://hooks.slack.com/x",
            SAVE_AS_GITHUB_ISSUE="true",
            RESEARCH_MODE="true",
        )
        mock_slack, mock_issue, mock_research = self._run_main(env)
        mock_slack.assert_called_once()
        mock_issue.assert_called_once()
        mock_research.assert_called_once()

    def test_no_slack_call_when_no_relevant_articles(self):
        env = self._base_env(SLACK_WEBHOOK_URL="https://hooks.slack.com/x")
        mock_slack, mock_issue, mock_research = self._run_main(env, relevant=[])
        mock_slack.assert_not_called()

    def test_research_mode_runs_when_no_relevant_articles(self):
        # Research Mode still runs with an empty list so the state file is
        # initialized on the first run even if nothing is relevant that day.
        env = self._base_env(RESEARCH_MODE="true")
        mock_slack, mock_issue, mock_research = self._run_main(env, relevant=[])
        mock_slack.assert_not_called()
        mock_research.assert_called_once()
        self.assertEqual(mock_research.call_args.args[0], [])

    def test_no_outputs_configured_does_not_raise(self):
        # Should warn but not crash.
        env = self._base_env()
        import io
        with patch("sys.stderr", new_callable=io.StringIO) as mock_stderr:
            self._run_main(env)
        self.assertIn("no outputs configured", mock_stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
