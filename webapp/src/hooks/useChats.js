import { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '../api/client';

export function useChats() {
  const [chats, setChats] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchJson('/chats');
      setChats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const favoriteCount = useMemo(
    () => chats.filter((chat) => chat.favorite).length,
    [chats]
  );

  const siteCounts = useMemo(() => {
    return chats.reduce((acc, chat) => {
      acc[chat.site] = (acc[chat.site] || 0) + 1;
      return acc;
    }, {});
  }, [chats]);

  const topSite = useMemo(() => {
    const entries = Object.entries(siteCounts);
    if (!entries.length) return null;
    return entries.sort((a, b) => b[1] - a[1])[0];
  }, [siteCounts]);

  return { chats, error, loading, favoriteCount, siteCounts, topSite, reload: load };
}