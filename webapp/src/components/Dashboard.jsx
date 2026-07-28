import { useState } from 'react';
import { useChats } from '../hooks/useChats';

import UserDashboard from './UserDashboard';
import StatsGrid from './StatsGrid';
import ChatList from './ChatList';
import ChatViewer from './ChatViewer';
import SiteBreakdown from './SiteBreakdown';

function Dashboard({ onLogout }) {
  const {
    chats,
    error,
    loading,
    favoriteCount,
    siteCounts,
    topSite,
    reload
  } = useChats();

  const [activeChat, setActiveChat] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "conversations", label: "Conversations", icon: "💬" },
    { id: "memories", label: "Memories", icon: "🧠" },
    { id: "analytics", label: "Analytics", icon: "📈" },
    { id: "settings", label: "Settings", icon: "⚙️" }
  ];

  return (
    <div className="app-layout">

      {/* Sidebar */}
      <aside className="app-sidebar">

        <div className="brand">
          <span>⚡</span>
          <h2>Synapse</h2>
        </div>


        <nav>
          {menuItems.map(item => (
            <button
              key={item.id}
              className={
                activeTab === item.id 
                  ? "nav-item active" 
                  : "nav-item"
              }
              onClick={() => setActiveTab(item.id)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
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



      {/* Main Area */}
      <main className="dashboard-main">

        <header className="dashboard-navbar">
          <div>
            <p className="eyebrow">
              AI MEMORY LAYER
            </p>

            <h1>
              {activeTab === "dashboard" 
                ? "Chat Archive Dashboard"
                : activeTab}
            </h1>
          </div>


          <button 
            className="refresh-btn"
            onClick={reload}
          >
            ↻ Refresh
          </button>

        </header>



        {activeTab === "dashboard" && (
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

                <SiteBreakdown 
                  siteCounts={siteCounts}
                />

              </div>

            </section>

          </>
        )}



        {activeTab === "conversations" && (
          <ChatList
            chats={chats}
            loading={loading}
            error={error}
            onReload={reload}
            onOpenChat={setActiveChat}
          />
        )}


        {activeTab === "memories" && (
          <div className="empty-state">
            🧠 Memory Explorer coming soon
          </div>
        )}


        {activeTab === "analytics" && (
          <div className="empty-state">
            📈 Analytics coming soon
          </div>
        )}


        {activeTab === "settings" && (
          <div className="empty-state">
            ⚙️ Settings coming soon
          </div>
        )}

      </main>



      {/* Chat Drawer */}
      {activeChat && (
        <ChatViewer
          chat={activeChat}
          onClose={() => setActiveChat(null)}
        />
      )}

    </div>
  );
}

export default Dashboard;