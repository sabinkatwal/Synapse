import { useUser } from '../hooks/useUser';
import './UserDashboard.css';

function UserDashboard({ stats, onLogout }) {
  const { user, loading, error } = useUser();

  if (loading) {
    return <div className="user-dashboard loading">Loading profile...</div>;
  }

  if (error || !user) {
    return <div className="user-dashboard error">Failed to load profile</div>;
  }

  const initials = user.email
    .split('@')[0]
    .split('.')
    .map((part) => part[0].toUpperCase())
    .join('');

  return (
    <div className="user-dashboard">
      <div className="user-profile-card">
        <div className="user-avatar">{initials}</div>
        <div className="user-info">
          <h3>{user.email}</h3>
          <p className="user-status">Active User</p>
        </div>
        <button className="logout-btn" onClick={onLogout} title="Sign out">
          ⎋
        </button>
      </div>

      <div className="user-stats">
        <div className="stat-item">
          <div className="stat-value">{stats.total || 0}</div>
          <div className="stat-label">Total Chats</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{stats.favoriteCount || 0}</div>
          <div className="stat-label">Favorites</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{stats.siteCount || 0}</div>
          <div className="stat-label">Sources</div>
        </div>
      </div>

      <div className="user-details">
        <div className="detail-row">
          <span className="detail-label">Member Since</span>
          <span className="detail-value">2024</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Storage Used</span>
          <span className="detail-value">Premium</span>
        </div>
      </div>
    </div>
  );
}

export default UserDashboard;
