import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.memory_retriever import build_memory_context, rank_memories


class MemoryRetrieverTests(unittest.TestCase):
    def setUp(self):
        now = datetime.now(timezone.utc)
        self.memories = [
            SimpleNamespace(
                title="Synapse project",
                content="We are building the Synapse memory layer for AI agents.",
                tags=["synapse", "memory"],
                memory_type="project",
                confidence=0.9,
                created_at=now,
            ),
            SimpleNamespace(
                title="Old unrelated fact",
                content="The user likes gardening.",
                tags=["hobby"],
                memory_type="fact",
                confidence=0.9,
                created_at=now - timedelta(days=90),
            ),
        ]

    def test_ranks_relevant_recent_memory_first(self):
        ranked = rank_memories(self.memories, "What are we building for Synapse?", limit=1)

        self.assertEqual(len(ranked), 1)
        self.assertEqual(ranked[0].title, "Synapse project")

    def test_builds_prompt_ready_context(self):
        context = build_memory_context(self.memories[:1])

        self.assertIn("Relevant user memories:", context)
        self.assertIn("Synapse project", context)
        self.assertIn("memory layer", context)


if __name__ == "__main__":
    unittest.main()
