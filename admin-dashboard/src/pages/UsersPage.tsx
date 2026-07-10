import { useState, useEffect } from 'react';
import { getUsers, createUser, updateUser, deleteUser } from '../api/client';
import type { User } from '../types';
import { Plus, Trash2, Pencil, Search } from 'lucide-react';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operator');
  const [label, setLabel] = useState('');
  const [search, setSearch] = useState('');
  const [editUser, setEditUser] = useState<any>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState('operator');
  const [editLabel, setEditLabel] = useState('');
  const [editActive, setEditActive] = useState(true);

  const fetchUsers = async () => { try { const data = await getUsers(); setUsers(data.users); } catch {} };
  useEffect(() => { fetchUsers(); }, []);
  const filtered = search ? users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()) || u.label?.toLowerCase().includes(search.toLowerCase()) || u.role?.toLowerCase().includes(search.toLowerCase())) : users;

  const handleCreate = async () => {
    try {
      await createUser({ username, password, role, label });
      setShowForm(false); setUsername(''); setPassword(''); fetchUsers();
    } catch {}
  };

  const handleEdit = (user: any) => {
    setEditUser(user); setEditUsername(user.username || ''); setEditPassword('');
    setEditRole(user.role || 'operator'); setEditLabel(user.label || '');
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
      if (Object.keys(data).length === 0) { setEditUser(null); return; }
      await updateUser(editUser.id, data); setEditUser(null); fetchUsers();
    } catch (e: any) { alert('Error: ' + (e.response?.data?.error || e.message)); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this user?')) return;
    try { await deleteUser(id); fetchUsers(); } catch {}
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-base-content">Users</h2>
          <p className="text-sm text-base-content/60 mt-1">Manage dashboard user accounts</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="btn btn-primary">
          <Plus size={18} /> Add User
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="card bg-base-100 border border-base-200 p-6 w-[400px] max-w-[90%] shadow-md">
            <h3 className="text-lg font-semibold text-base-content mb-5">Add User</h3>
            <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)}
              className="input input-bordered w-full mb-3" />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
              className="input input-bordered w-full mb-3" />
            <input placeholder="Label" value={label} onChange={e => setLabel(e.target.value)}
              className="input input-bordered w-full mb-3" />
            <select value={role} onChange={e => setRole(e.target.value)}
              className="input input-bordered w-full mb-5">
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </select>
            <div className="flex gap-3">
              <button onClick={handleCreate}
                className="btn btn-primary flex-1">Create</button>
              <button onClick={() => setShowForm(false)}
                className="btn btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="card bg-base-100 border border-base-200 p-6 w-[400px] max-w-[90%] shadow-md">
            <h3 className="text-lg font-semibold text-base-content mb-5">Edit User</h3>
            <input placeholder="Username" value={editUsername} onChange={e => setEditUsername(e.target.value)}
              className="input input-bordered w-full mb-3" />
            <input type="password" placeholder="New password (leave empty)" value={editPassword} onChange={e => setEditPassword(e.target.value)}
              className="input input-bordered w-full mb-3" />
            <input placeholder="Label" value={editLabel} onChange={e => setEditLabel(e.target.value)}
              className="input input-bordered w-full mb-3" />
            <select value={editRole} onChange={e => setEditRole(e.target.value)}
              className="input input-bordered w-full mb-3">
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </select>
            <label className="flex items-center gap-2 mb-5 text-sm text-base-content/80 cursor-pointer">
              <input type="checkbox" checked={editActive} onChange={e => setEditActive(e.target.checked)}
                className="w-4 h-4 rounded border-base-300 text-primary" />
              Active
            </label>
            <div className="flex gap-3">
              <button onClick={handleUpdate}
                className="btn btn-primary flex-1">Save</button>
              <button onClick={() => setEditUser(null)}
                className="btn btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="card bg-base-100 border border-base-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-base-200">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-base-content/60 shrink-0" />
              <input placeholder="Cari user..." value={search} onChange={e => setSearch(e.target.value)}
                className="input input-bordered w-full max-w-sm" />
            </div>
          </div>
        <table className="table w-full">
          <thead>
            <tr className="bg-base-200/50">
              <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider px-4 py-3">Username</th>
              <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider px-4 py-3">Label</th>
              <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider px-4 py-3">Role</th>
              <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider px-4 py-3">Status</th>
              <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider px-4 py-3">Created</th>
              <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr key={user.id} className="hover:bg-base-200/30 transition-colors">
                <td className="px-4 py-3 text-sm text-base-content font-medium">{user.username}</td>
                <td className="px-4 py-3 text-sm text-base-content/60">{user.label}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${user.role === 'admin' ? 'badge-primary' : 'badge-ghost'}`}>{user.role}</span>
                </td>
                <td className="px-4 py-3">
                  {user.active ? (
                    <span className="badge badge-success">Active</span>
                  ) : (
                    <span className="text-xs text-error">Inactive</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-base-content/60">{new Date(user.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(user)}
                      className="btn btn-ghost btn-sm text-primary"><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(user.id)}
                      className="btn btn-ghost btn-sm text-error"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-center py-10 text-sm text-base-content/60">No users yet</div>}
      </div>
    </div>
  );
}
