import { useState, useEffect } from 'react';
import { getUsers, createUser, updateUser, deleteUser } from '../api/client';
import type { User } from '../types';
import { Users, Plus, Trash2, Pencil } from 'lucide-react';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operator');
  const [label, setLabel] = useState('');
  const [editUser, setEditUser] = useState<any>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState('operator');
  const [editLabel, setEditLabel] = useState('');
  const [editActive, setEditActive] = useState(true);

  const fetchUsers = async () => {
    try {
      const data = await getUsers();
      setUsers(data.users);
    } catch {}
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async () => {
    try {
      await createUser({ username, password, role, label });
      setShowForm(false);
      setUsername('');
      setPassword('');
      fetchUsers();
    } catch {}
  };

  const handleEdit = (user: any) => {
    setEditUser(user);
    setEditUsername(user.username || '');
    setEditPassword('');
    setEditRole(user.role || 'operator');
    setEditLabel(user.label || '');
    setEditActive(user.active === 1 || user.active === true);
  };

  const handleUpdate = async () => {
    if (!editUser) return;
    try {
      const data: any = {};
      if (editUsername && editUsername !== editUser.username) data.username = editUsername;
      if (editPassword) data.password = editPassword;
      if (editRole !== editUser.role) data.role = editRole;
      if (editLabel !== editUser.label) data.label = editLabel;
      if (editActive !== (editUser.active === 1 || editUser.active === true)) data.active = editActive;
      
      if (Object.keys(data).length === 0) {
        setEditUser(null);
        return;
      }
      await updateUser(editUser.id, data);
      setEditUser(null);
      fetchUsers();
    } catch (e: any) {
      alert('Error: ' + (e.response?.data?.error || e.message));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this user?')) return;
    try {
      await deleteUser(id);
      fetchUsers();
    } catch {}
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 'bold', margin: 0, color: '#E0E0FF' }}>
          <Users size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Users
        </h2>
        <button onClick={() => setShowForm(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#00F0FF', color: '#09090E', border: 'none', borderRadius: 8, fontWeight: 'bold', fontSize: 14, cursor: 'pointer' }}>
          <Plus size={18} /> Add User
        </button>
      </div>

      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: '#13131A', borderRadius: 16, padding: 32, width: 400, maxWidth: '90%', border: '1px solid #2A2A3C' }}>
            <h3 style={{ color: '#E0E0FF', margin: '0 0 20px' }}>Add User</h3>
            <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 6, background: '#09090E', border: '1px solid #2A2A3C', color: '#E0E0FF', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 6, background: '#09090E', border: '1px solid #2A2A3C', color: '#E0E0FF', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />
            <input placeholder="Label" value={label} onChange={e => setLabel(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 6, background: '#09090E', border: '1px solid #2A2A3C', color: '#E0E0FF', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />
            <select value={role} onChange={e => setRole(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 6, background: '#09090E', border: '1px solid #2A2A3C', color: '#E0E0FF', fontSize: 14, marginBottom: 20 }}>
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </select>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleCreate} style={{ flex: 1, padding: 12, background: '#00F0FF', color: '#09090E', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>Create</button>
              <button onClick={() => setShowForm(false)} style={{ padding: '12px 24px', background: '#1F1F2C', color: '#6B6B80', border: '1px solid #2A2A3C', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editUser && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: '#13131A', borderRadius: 16, padding: 32, width: 400, maxWidth: '90%', border: '1px solid #2A2A3C' }}>
            <h3 style={{ color: '#E0E0FF', margin: '0 0 20px' }}>Edit User</h3>
            <input placeholder="Username" value={editUsername} onChange={e => setEditUsername(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 6, background: '#09090E', border: '1px solid #2A2A3C', color: '#E0E0FF', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />
            <input type="password" placeholder="New password (leave empty to keep)" value={editPassword} onChange={e => setEditPassword(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 6, background: '#09090E', border: '1px solid #2A2A3C', color: '#E0E0FF', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />
            <input placeholder="Label" value={editLabel} onChange={e => setEditLabel(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 6, background: '#09090E', border: '1px solid #2A2A3C', color: '#E0E0FF', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />
            <select value={editRole} onChange={e => setEditRole(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 6, background: '#09090E', border: '1px solid #2A2A3C', color: '#E0E0FF', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}>
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, color: '#E0E0FF', fontSize: 14 }}>
              <input type="checkbox" checked={editActive} onChange={e => setEditActive(e.target.checked)}
                style={{ width: 16, height: 16 }} />
              Active
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleUpdate} style={{ flex: 1, padding: 12, background: '#00F0FF', color: '#09090E', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>Save</button>
              <button onClick={() => setEditUser(null)} style={{ padding: '12px 24px', background: '#1F1F2C', color: '#6B6B80', border: '1px solid #2A2A3C', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {users.map((user) => (
        <div key={user.id} style={{
          background: '#13131A', borderRadius: 12, padding: 16, marginBottom: 8,
          border: '1px solid #2A2A3C', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ color: '#E0E0FF', fontSize: 14 }}>{user.username}</span>
              <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: user.role === 'admin' ? '#FCE20520' : '#00F0FF20', color: user.role === 'admin' ? '#FCE205' : '#00F0FF' }}>
                {user.role}
              </span>
              {!user.active && <span style={{ color: '#FF003C', fontSize: 11 }}>Inactive</span>}
            </div>
            <div style={{ color: '#6B6B80', fontSize: 12 }}>
              {user.label} · Created: {new Date(user.created_at).toLocaleDateString()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleEdit(user)}
              style={{ padding: '8px 12px', background: '#00F0FF20', color: '#00F0FF', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              <Pencil size={14} />
            </button>
            <button onClick={() => handleDelete(user.id)}
              style={{ padding: '8px 12px', background: '#FF003C20', color: '#FF003C', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
