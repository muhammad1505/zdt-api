import { useState, useEffect } from 'react';
import { getUsers, createUser, updateUser, deleteUser } from '../api/client';
import type { User } from '../types';
import { Plus, Trash2, Pencil } from 'lucide-react';

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

  const fetchUsers = async () => { try { const data = await getUsers(); setUsers(data.users); } catch {} };
  useEffect(() => { fetchUsers(); }, []);

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
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Users</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage dashboard user accounts</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors border-none cursor-pointer">
          <Plus size={18} /> Add User
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 w-[400px] max-w-[90%] shadow-theme-md">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-5">Add User</h3>
            <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm mb-3 box-border outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors" />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm mb-3 box-border outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors" />
            <input placeholder="Label" value={label} onChange={e => setLabel(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm mb-3 box-border outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors" />
            <select value={role} onChange={e => setRole(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm mb-5 outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors">
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </select>
            <div className="flex gap-3">
              <button onClick={handleCreate}
                className="flex-1 py-3 rounded-lg bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 transition-colors border-none cursor-pointer">Create</button>
              <button onClick={() => setShowForm(false)}
                className="px-6 py-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-transparent cursor-pointer">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 w-[400px] max-w-[90%] shadow-theme-md">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-5">Edit User</h3>
            <input placeholder="Username" value={editUsername} onChange={e => setEditUsername(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm mb-3 box-border outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors" />
            <input type="password" placeholder="New password (leave empty)" value={editPassword} onChange={e => setEditPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm mb-3 box-border outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors" />
            <input placeholder="Label" value={editLabel} onChange={e => setEditLabel(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm mb-3 box-border outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors" />
            <select value={editRole} onChange={e => setEditRole(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm mb-3 outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors">
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </select>
            <label className="flex items-center gap-2 mb-5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" checked={editActive} onChange={e => setEditActive(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500" />
              Active
            </label>
            <div className="flex gap-3">
              <button onClick={handleUpdate}
                className="flex-1 py-3 rounded-lg bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 transition-colors border-none cursor-pointer">Save</button>
              <button onClick={() => setEditUser(null)}
                className="px-6 py-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-transparent cursor-pointer">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {users.map((user) => (
          <div key={user.id} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4 flex justify-between items-center gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm text-gray-800 dark:text-white/90 font-medium">{user.username}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  user.role === 'admin' ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}>{user.role}</span>
                {!user.active && <span className="text-xs text-error-600 dark:text-error-500">Inactive</span>}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{user.label} · Created: {new Date(user.created_at).toLocaleDateString()}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleEdit(user)}
                className="p-2 rounded-md bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 border-none cursor-pointer hover:bg-brand-100 dark:hover:bg-brand-500/20 transition-colors"><Pencil size={14} /></button>
              <button onClick={() => handleDelete(user.id)}
                className="p-2 rounded-md bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-500 border-none cursor-pointer hover:bg-error-100 dark:hover:bg-error-500/20 transition-colors"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
