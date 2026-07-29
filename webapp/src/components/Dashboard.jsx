import { useEffect, useState } from 'react';
import {
  BarChart3,
  Brain,
  Home,
  MessageSquare,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useChats } from '../hooks/useChats';

import UserDashboard from './UserDashboard';
import StatsGrid from './StatsGrid';
import ChatList from './ChatList';
import ChatViewer from './ChatViewer';
import SiteBreakdown from './SiteBreakdown';
import SettingsPanel from './SettingsPanel';
import AnalyticsPanel from './AnalyticsPanel';
import MemoriesPanel from './MemoriesPanel';
import AIChatPanel from './AIChatPanel';
import CommandPalette from './CommandPalette';

function Dashboard({ onLogout }) {
  const {
    chats,
    error,
    loading,
    favoriteCount,
    siteCounts,
    topSite,
    reload,
  } = useChats();

  const [activeChat, setActiveChat] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [commandOpen, setCommandOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'ai-chat', label: 'AI Chat', icon: Sparkles },
    { id: 'memories', label: 'Memory', icon: Brain },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'conversations', label: 'Conversations', icon: MessageSquare },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  useEffect(() => {
    const handleKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const pageTitle = activeTab === 'dashboard'
    ? 'AI Command Center'
    : menuItems.find((item) => item.id === activeTab)?.label || activeTab;

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <div className="brand">
          <span>S</span>
          <h2>Synapse</h2>
        </div>

        <nav>
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={activeTab === item.id ? 'nav-item active' : 'nav-item'}
                onClick={() => setActiveTab(item.id)}
              >
                <span><Icon size={17} strokeWidth={2.2} /></span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-user">
          <UserDashboard
            stats={{
              total: chats.length,
              favoriteCount,
              siteCount: Object.keys(siteCounts).length,
            }}
            onLogout={onLogout}
          />
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-navbar">
          <div>
            <p className="eyebrow">AI MEMORY LAYER</p>
            <h1>{pageTitle}</h1>
          </div>

          <div className="navbar-actions">
            <button className="command-btn" onClick={() => setCommandOpen(true)}>
              <Search size={16} strokeWidth={2.2} /> Search <span>Ctrl K</span>
            </button>
            <button className="refresh-btn" onClick={reload}>
              Refresh
            </button>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <>
            <StatsGrid
              total={chats.length}
              favoriteCount={favoriteCount}
              topSite={topSite}
            />

            <section className="content-grid">
              <div className="conversation-panel">
                <ChatList
                  chats={chats}
                  loading={loading}
                  error={error}
                  onReload={reload}
                  onOpenChat={setActiveChat}
                />
              </div>

              <div className="analytics-panel">
                <SiteBreakdown siteCounts={siteCounts} />
              </div>
            </section>
          </>
        )}

        {activeTab === 'ai-chat' && (
          <AIChatPanel chats={chats} onOpenChat={setActiveChat} />
        )}

        {activeTab === 'conversations' && (
          <ChatList
            chats={chats}
            loading={loading}
            error={error}
            onReload={reload}
            onOpenChat={setActiveChat}
          />
        )}

        {activeTab === 'memories' && (
          <MemoriesPanel chats={chats} onOpenChat={setActiveChat} />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsPanel
            chats={chats}
            siteCounts={siteCounts}
            favoriteCount={favoriteCount}
            topSite={topSite}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPanel
            chats={chats}
            onReload={reload}
            onLogout={onLogout}
          />
        )}
      </main>

      {activeChat && (
        <ChatViewer
          chat={activeChat}
          onClose={() => setActiveChat(null)}
        />
      )}

      <CommandPalette
        open={commandOpen}
        chats={chats}
        menuItems={menuItems}
        onClose={() => setCommandOpen(false)}
        onNavigate={setActiveTab}
        onOpenChat={setActiveChat}
      />
    </div>
  );
}

export default Dashboard;
