import unittest

from app.services.memory_extractor import extract_memories_from_messages


class MemoryExtractorTests(unittest.TestCase):
    def test_extracts_preference_and_project_memories(self):
        messages = [
            {"role": "user", "text": "I prefer TypeScript and want a clean dashboard."},
            {"role": "assistant", "text": "I can help with that."},
            {"role": "user", "text": "We are building a memory layer for Synapse and need to track what the user is doing."},
        ]

        memories = extract_memories_from_messages(messages)

        self.assertGreaterEqual(len(memories), 2)
        self.assertTrue(any(item["memory_type"] == "preference" for item in memories))
        self.assertTrue(any(item["memory_type"] == "project" for item in memories))
        self.assertTrue(any("TypeScript" in item["content"] for item in memories))
        self.assertTrue(any("Synapse" in item["content"] for item in memories))


if __name__ == "__main__":
    unittest.main()
