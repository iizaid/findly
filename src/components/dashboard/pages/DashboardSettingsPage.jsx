import { useState, useRef, useCallback, useMemo } from 'react';
import { LogOut, User, Building2, Shield, WalletCards, Bell, Loader2, Trash2, Eye, EyeOff } from 'lucide-react';
import DashboardCard from '../DashboardCard';
import AvatarCropperModal from '../AvatarCropperModal';
import UserAvatar from '../../common/UserAvatar';
import { apiRequest } from '../../../lib/api';

const TABS = [
  { id: 'general', label: 'General', icon: User },
  { id: 'workspace', label: 'Workspace', icon: Building2 },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'billing', label: 'Billing & Credits', icon: WalletCards },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];



const DashboardSettingsPage = ({ user, workspace, credits, onLogout, onUpdate, onNavigate, onNotice }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [name, setName] = useState(user?.name || '');
  const [workspaceName, setWorkspaceName] = useState(workspace?.name || 'Default workspace');

  // Loadings & messages
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState(null);

  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [workspaceMessage, setWorkspaceMessage] = useState(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isLoadingPassword, setIsLoadingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);
  
  const [isLoadingLogoutAll, setIsLoadingLogoutAll] = useState(false);

  // Avatar upload
  const fileInputRef = useRef(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Security & Notification UI states (Phase 5)
  const twoFA = Boolean(user?.twoFactorEnabled);
  const [notifyMarketing, setNotifyMarketing] = useState(user?.notifyMarketing || false);
  const [notifyReports, setNotifyReports] = useState(user?.notifyReports ?? true);
  const [notifySecurity, setNotifySecurity] = useState(user?.notifySecurity ?? true);

  const [isUpdatingSetting, setIsUpdatingSetting] = useState(false);

  const showNotice = useCallback((title, message) => {
    onNotice?.({
      title,
      message,
      actionLabel: 'Got it',
    });
  }, [onNotice]);

  // Password visibility
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');

  // Danger zone
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isDeletingAvatar, setIsDeletingAvatar] = useState(false);

  // Avatar Cropper state
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [cropperImageSrc, setCropperImageSrc] = useState(null);

  // Real team members ONLY
  const teamMembers = [
    { id: 1, name: user?.name || 'You', email: user?.email || '', role: 'Admin', isYou: true },
  ];

  // Handlers
  const handleUpdateProfile = useCallback(async () => {
    setIsLoadingProfile(true);
    setProfileMessage(null);
    try {
      await apiRequest('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      setProfileMessage({ type: 'success', text: 'Profile updated successfully.' });
      onUpdate?.();
    } catch (error) {
      setProfileMessage({ type: 'error', text: error.message || 'Failed to update profile.' });
    } finally {
      setIsLoadingProfile(false);
    }
  }, [name, onUpdate]);

  const handleAvatarChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size before cropping
    if (file.size > 2 * 1024 * 1024) {
      setProfileMessage({ type: 'error', text: 'Image is too large. Please select an image under 2MB.' });
      return;
    }

    const url = URL.createObjectURL(file);
    setCropperImageSrc(url);
    setIsCropperOpen(true);
    e.target.value = null;
  }, []);

  const handleCroppedUpload = useCallback(async (croppedBlob) => {
    setIsCropperOpen(false);
    setIsUploadingAvatar(true);
    setProfileMessage(null);
    
    try {
      const formData = new FormData();
      formData.append('avatar', croppedBlob, 'avatar.jpg');

      await apiRequest('/api/users/me/avatar', {
        method: 'POST',
        body: formData,
      });
      setProfileMessage({ type: 'success', text: 'Profile picture securely updated.' });
      onUpdate?.();
    } catch (error) {
      setProfileMessage({ type: 'error', text: error.message || 'Failed to upload profile picture.' });
    } finally {
      setIsUploadingAvatar(false);
      if (cropperImageSrc) {
        URL.revokeObjectURL(cropperImageSrc);
        setCropperImageSrc(null);
      }
    }
  }, [cropperImageSrc, onUpdate]);

  const handleUpdateWorkspace = useCallback(async () => {
    if (!workspace?.id) return;
    setIsLoadingWorkspace(true);
    setWorkspaceMessage(null);
    try {
      await apiRequest(`/api/workspaces/${workspace.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: workspaceName }),
      });
      setWorkspaceMessage({ type: 'success', text: 'Workspace updated successfully.' });
      onUpdate?.();
    } catch (error) {
      setWorkspaceMessage({ type: 'error', text: error.message || 'Failed to update workspace.' });
    } finally {
      setIsLoadingWorkspace(false);
    }
  }, [workspace, workspaceName, onUpdate]);

  const handleUpdatePassword = useCallback(async () => {
    setIsLoadingPassword(true);
    setPasswordMessage(null);
    try {
      await apiRequest('/api/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPasswordMessage({ type: 'success', text: 'Password updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setPasswordMessage({ type: 'error', text: error.message || 'Failed to update password.' });
    } finally {
      setIsLoadingPassword(false);
    }
  }, [currentPassword, newPassword]);

  const handleToggleSetting = useCallback(async (settingName, currentValue, setterFunc) => {
    if (isUpdatingSetting) return;
    setIsUpdatingSetting(true);
    
    const newValue = !currentValue;
    setterFunc(newValue); // Optimistic UI update
    
    try {
      await apiRequest('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ [settingName]: newValue }),
      });
      onUpdate?.(); // Sync context
    } catch (error) {
      setterFunc(currentValue); // Revert on failure
      console.error(`Failed to update ${settingName}:`, error);
    } finally {
      setIsUpdatingSetting(false);
    }
  }, [isUpdatingSetting, onUpdate]);

  const handleUnavailableTeamInvite = () => {
    showNotice(
      'Team invites are coming later',
      'Workspace invites need role permissions and email delivery flows. For now this workspace is single-user and protected.',
    );
  };

  const handleUnavailable2FA = () => {
    showNotice(
      'Two-factor authentication is not enabled yet',
      'Findly will only expose this toggle after the full 2FA setup, recovery-code, and verification flow is connected.',
    );
  };

  const handleUpgradePlan = () => {
    if (onNavigate) {
      onNavigate('/#pricing');
      return;
    }

    window.location.assign('/#pricing');
  };

  const handleLogoutEverywhere = useCallback(async () => {
    setIsLoadingLogoutAll(true);
    try {
      await apiRequest('/api/auth/logout-everywhere', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      onLogout?.();
    } catch (error) {
      console.error(error);
      setIsLoadingLogoutAll(false);
    }
  }, [onLogout]);

  const handleRemoveAvatar = useCallback(async () => {
    setIsDeletingAvatar(true);
    try {
      await apiRequest('/api/users/me/avatar', { method: 'DELETE' });
      setProfileMessage({ type: 'success', text: 'Profile picture removed.' });
      onUpdate?.();
    } catch (error) {
      setProfileMessage({ type: 'error', text: error.message || 'Failed to remove picture.' });
    } finally {
      setIsDeletingAvatar(false);
    }
  }, [onUpdate]);

  const handleDeleteAccount = useCallback(async () => {
    if (!deletePassword) return;
    setIsDeletingAccount(true);
    try {
      await apiRequest('/api/users/me', {
        method: 'DELETE',
        body: JSON.stringify({ password: deletePassword }),
      });
      onLogout?.();
    } catch (error) {
      setPasswordMessage({ type: 'error', text: error.message || 'Failed to delete account.' });
      setIsDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
  }, [deletePassword, onLogout]);

  const pwStrength = useMemo(() => {
    if (!newPassword) return { label: '', color: '', width: '0%' };
    let score = 0;
    if (newPassword.length >= 8) score++;
    if (newPassword.length >= 12) score++;
    if (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;
    if (score <= 1) return { label: 'Weak', color: 'bg-red-500', width: '20%' };
    if (score <= 2) return { label: 'Fair', color: 'bg-amber-500', width: '40%' };
    if (score <= 3) return { label: 'Good', color: 'bg-yellow-500', width: '60%' };
    if (score <= 4) return { label: 'Strong', color: 'bg-emerald-500', width: '80%' };
    return { label: 'Excellent', color: 'bg-emerald-600', width: '100%' };
  }, [newPassword]);

  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const canUpdatePassword = currentPassword && newPassword.length >= 10 && passwordsMatch;

  return (
    <div className="grid min-h-[calc(100vh-132px)] gap-5 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]">
      {/* Sidebar Navigation */}
      <DashboardCard className="p-5 self-start">
        <p className="px-3 text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-3">Settings</p>
        <nav className="flex flex-col space-y-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition-all ${
                  isActive
                    ? 'bg-[#F7F8F6] text-black'
                    : 'text-secondary hover:bg-white hover:text-black'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-black' : 'text-secondary'} />
                {tab.label}
              </button>
            );
          })}
          
          <div className="my-4 border-t border-black/[0.04]" />
          
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold text-red-600 transition-all hover:bg-red-50"
          >
            <LogOut size={18} className="text-red-500" />
            Log out
          </button>
        </nav>
      </DashboardCard>

      {/* Main Content Area */}
      <div className="flex-1">
        {activeTab === 'general' && (
          <DashboardCard className="p-5 md:p-7 relative overflow-hidden">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Settings</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tighter md:text-4xl mb-7">General</h2>
            
            <div className="space-y-7 max-w-xl">
              {/* Avatar Section */}
              <div className="flex items-center gap-5">
                <UserAvatar user={user} size="lg" rounded="rounded-[24px]" />
                <div>
                  <input 
                    type="file" 
                    accept="image/png, image/jpeg, image/webp" 
                    ref={fileInputRef} 
                    onChange={handleAvatarChange} 
                    className="hidden" 
                  />
                <div className="flex items-center gap-2 flex-wrap">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    className="rounded-full flex items-center justify-center gap-2 bg-[#F7F8F6] px-5 py-2.5 text-sm font-bold text-black hover:bg-white border border-black/[0.08] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                  >
                    {isUploadingAvatar && <Loader2 size={16} className="animate-spin" />}
                    {isUploadingAvatar ? 'Uploading...' : 'Upload new picture'}
                  </button>
                  {user?.avatarUrl && (
                    <button 
                      onClick={handleRemoveAvatar}
                      disabled={isDeletingAvatar}
                      className="rounded-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 border border-red-200 transition-colors outline-none disabled:opacity-50"
                    >
                      {isDeletingAvatar ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      Remove
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs font-semibold text-secondary">JPG, PNG, or WebP. Max size 2MB.</p>
                </div>
              </div>

              <div className="border-t border-black/[0.04]" />

              {/* Profile Details */}
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-black">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11 w-full rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 text-sm font-bold text-black outline-none transition-all hover:bg-white focus:border-black/20 focus:bg-white focus:ring-2 focus:ring-black/5"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-black">Email Address</label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="h-11 w-full rounded-2xl border border-black/5 bg-black/[0.04] px-4 text-sm font-bold text-black/50 outline-none cursor-not-allowed"
                  />
                  <p className="text-xs font-semibold text-secondary">Email changes require a fresh verification flow and are not enabled yet.</p>
                </div>
              </div>

              {profileMessage && (
                <div className={`rounded-xl px-4 py-3 text-sm font-bold ${profileMessage.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                  {profileMessage.text}
                </div>
              )}

              <div className="flex justify-end pt-4">
                <button 
                  onClick={handleUpdateProfile}
                  disabled={isLoadingProfile}
                  className="flex items-center gap-2 h-11 rounded-full bg-black px-6 text-sm font-bold text-white shadow-sm transition-all hover:bg-black/80 outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-70"
                >
                  {isLoadingProfile && <Loader2 size={16} className="animate-spin" />}
                  Save Changes
                </button>
              </div>
            </div>
          </DashboardCard>
        )}

        {activeTab === 'workspace' && (
          <div className="space-y-5">
            <DashboardCard className="p-5 md:p-7">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Settings</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tighter md:text-4xl mb-7">Workspace</h2>
              
              <div className="space-y-6 max-w-xl">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-black">Workspace Name</label>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="h-11 w-full rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 text-sm font-bold text-black outline-none transition-all hover:bg-white focus:border-black/20 focus:bg-white focus:ring-2 focus:ring-black/5"
                  />
                  <p className="text-xs font-semibold text-secondary">This is your company's visible name on Findly.</p>
                </div>

                {workspaceMessage && (
                  <div className={`rounded-xl px-4 py-3 text-sm font-bold ${workspaceMessage.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                    {workspaceMessage.text}
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button 
                    onClick={handleUpdateWorkspace}
                    disabled={isLoadingWorkspace}
                    className="flex items-center gap-2 h-11 rounded-full bg-black px-6 text-sm font-bold text-white shadow-sm transition-all hover:bg-black/80 outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-70"
                  >
                    {isLoadingWorkspace && <Loader2 size={16} className="animate-spin" />}
                    Save Workspace
                  </button>
                </div>
              </div>
            </DashboardCard>

            <DashboardCard className="p-5 md:p-7">
              <div className="flex items-center justify-between mb-7">
                <div>
                  <h3 className="text-2xl font-bold tracking-tighter text-black">Team Members</h3>
                  <p className="mt-1 text-sm font-semibold text-secondary">Manage who has access to this workspace.</p>
                </div>
                <button
                  type="button"
                  onClick={handleUnavailableTeamInvite}
                  className="h-11 rounded-full bg-accent px-6 text-sm font-bold text-black shadow-sm transition-all hover:bg-accent-dark outline-none focus-visible:ring-2 focus-visible:ring-black"
                >
                  Invite Member
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/[0.08]">
                      <th className="pb-3 font-bold uppercase tracking-wider text-secondary text-xs">User</th>
                      <th className="pb-3 font-bold uppercase tracking-wider text-secondary text-xs">Role</th>
                      <th className="pb-3 font-bold uppercase tracking-wider text-secondary text-xs text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.08]">
                    {teamMembers.map((member) => (
                      <tr key={member.id} className="group">
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              user={member.isYou ? user : null}
                              size="md"
                              rounded="rounded-xl"
                            />
                            <div>
                              <p className="font-bold text-black">
                                {member.name} {member.isYou && <span className="ml-2 rounded-lg bg-black/5 px-2 py-0.5 text-[10px] font-bold text-black/50 uppercase tracking-wider">You</span>}
                              </p>
                              <p className="text-xs font-semibold text-secondary">{member.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4">
                          <span className={`inline-flex items-center rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wider ${member.role === 'Admin' ? 'bg-accent/20 text-black' : 'bg-black/5 text-black/60'}`}>
                            {member.role}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          {!member.isYou ? (
                            <button className="text-sm font-bold text-red-600 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity">
                              Remove
                            </button>
                          ) : (
                            <span className="text-sm font-bold text-black/20">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DashboardCard>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-5">
            <DashboardCard className="p-5 md:p-7">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Settings</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tighter md:text-4xl mb-7">Security</h2>
              
              <div className="space-y-6 max-w-xl">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-black">Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrentPw ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="h-11 w-full rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 pr-11 text-sm font-bold text-black outline-none transition-all hover:bg-white focus:border-black/20 focus:bg-white focus:ring-2 focus:ring-black/5"
                    />
                    <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/60">
                      {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-black">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-11 w-full rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 pr-11 text-sm font-bold text-black outline-none transition-all hover:bg-white focus:border-black/20 focus:bg-white focus:ring-2 focus:ring-black/5"
                    />
                    <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/60">
                      {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {newPassword && (
                    <div className="space-y-1.5 pt-1">
                      <div className="h-1.5 w-full rounded-full bg-black/10 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${pwStrength.color}`} style={{ width: pwStrength.width }} />
                      </div>
                      <p className="text-xs font-bold text-secondary">{pwStrength.label}</p>
                    </div>
                  )}
                  <p className="text-xs font-semibold text-secondary">Minimum 10 characters with uppercase, lowercase, number, and symbol.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-black">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`h-11 w-full rounded-2xl border px-4 text-sm font-bold text-black outline-none transition-all hover:bg-white focus:bg-white focus:ring-2 focus:ring-black/5 ${
                      confirmPassword && !passwordsMatch ? 'border-red-300 bg-red-50/50' : 'border-black/[0.08] bg-[#F7F8F6]'
                    }`}
                  />
                  {confirmPassword && !passwordsMatch && (
                    <p className="text-xs font-bold text-red-500">Passwords do not match.</p>
                  )}
                </div>

                {passwordMessage && (
                  <div className={`rounded-xl px-4 py-3 text-sm font-bold ${passwordMessage.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                    {passwordMessage.text}
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button 
                    onClick={handleUpdatePassword}
                    disabled={isLoadingPassword || !canUpdatePassword}
                    className="flex items-center gap-2 h-11 rounded-full bg-black px-6 text-sm font-bold text-white shadow-sm transition-all hover:bg-black/80 outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-70"
                  >
                    {isLoadingPassword && <Loader2 size={16} className="animate-spin" />}
                    Update Password
                  </button>
                </div>
              </div>
            </DashboardCard>

            <DashboardCard className="p-5 md:p-7">
              <h3 className="text-2xl font-bold tracking-tighter text-black mb-6">Additional Security</h3>
              
              <div className="max-w-xl space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-black">Two-Factor Authentication (2FA)</p>
                    <p className="mt-1 text-xs font-semibold text-secondary">Protect your account with an extra layer of security.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleUnavailable2FA}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 ${
                      twoFA ? 'bg-black' : 'bg-black/20'
                    }`}
                    aria-label="Two-factor authentication status"
                  >
                    <span
                      className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        twoFA ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="border-t border-black/[0.08]" />
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-black">Active Sessions</p>
                    <p className="mt-1 text-xs font-semibold text-secondary">You are currently logged in on this device.</p>
                  </div>
                  <button 
                    onClick={handleLogoutEverywhere}
                    disabled={isLoadingLogoutAll}
                    className="flex items-center gap-2 h-10 rounded-xl bg-red-50 px-4 text-xs font-bold uppercase tracking-wider text-red-600 transition-all hover:bg-red-100 hover:text-red-700 outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:opacity-50"
                  >
                    {isLoadingLogoutAll && <Loader2 size={14} className="animate-spin" />}
                    Log out everywhere
                  </button>
                </div>
              </div>
            </DashboardCard>

            {/* Danger Zone */}
            <DashboardCard className="p-5 md:p-7 border-red-200">
              <h3 className="text-2xl font-bold tracking-tighter text-red-600 mb-2">Danger Zone</h3>
              <p className="text-sm font-semibold text-secondary mb-6">Irreversible actions that permanently affect your account.</p>
              
              <div className="max-w-xl rounded-2xl border border-red-200 bg-red-50/50 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-black">Delete Account</p>
                    <p className="mt-1 text-xs font-semibold text-secondary">Permanently remove your account, all data, leads, and workspace. This cannot be undone.</p>
                  </div>
                  <button 
                    onClick={() => setShowDeleteConfirm(true)}
                    className="shrink-0 flex items-center gap-2 h-10 rounded-xl bg-red-600 px-5 text-xs font-bold uppercase tracking-wider text-white transition-all hover:bg-red-700 outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            </DashboardCard>
          </div>
        )}

        {activeTab === 'notifications' && (
          <DashboardCard className="p-5 md:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Settings</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tighter md:text-4xl mb-7">Notifications</h2>
            
            <div className="max-w-xl space-y-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-black">Weekly Lead Reports</p>
                  <p className="mt-1 text-xs font-semibold text-secondary">Get a summary of new leads and opportunities found in your workspace.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSetting('notifyReports', notifyReports, setNotifyReports)}
                  disabled={isUpdatingSetting}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 ${
                    notifyReports ? 'bg-black' : 'bg-black/20'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${notifyReports ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="border-t border-black/[0.08]" />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-black">Security Alerts</p>
                  <p className="mt-1 text-xs font-semibold text-secondary">Get notified about new sign-ins or password changes.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSetting('notifySecurity', notifySecurity, setNotifySecurity)}
                  disabled={isUpdatingSetting}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 ${
                    notifySecurity ? 'bg-black' : 'bg-black/20'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${notifySecurity ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="border-t border-black/[0.08]" />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-black">Marketing & Product Updates</p>
                  <p className="mt-1 text-xs font-semibold text-secondary">Receive tips, tutorials, and early access to new features.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSetting('notifyMarketing', notifyMarketing, setNotifyMarketing)}
                  disabled={isUpdatingSetting}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 ${
                    notifyMarketing ? 'bg-black' : 'bg-black/20'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${notifyMarketing ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
          </DashboardCard>
        )}

        {activeTab === 'billing' && (
          <div className="space-y-5">
            <DashboardCard className="p-5 md:p-7">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Settings</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tighter md:text-4xl mb-7">Billing & Credits</h2>
              
              <div className="grid gap-4 sm:grid-cols-2 mb-6">
                <div className="rounded-[22px] border border-black/[0.08] bg-[#F7F8F6] p-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-secondary">Current Plan</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-black">{user?.plan === 'PRO' ? 'Pro Plan' : 'Free Plan'}</p>
                  <p className="mt-1 text-sm font-semibold text-secondary">Billing coming later.</p>
                </div>
                <div className="rounded-[22px] border border-accent/30 bg-accent/5 p-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-secondary">Credits Balance</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-black">{credits?.balance ?? user?.creditsBalance ?? 0}</p>
                  <p className="mt-1 text-sm font-semibold text-secondary">Opportunity Credits remaining</p>
                </div>
              </div>

              <div className="flex justify-end mb-6">
                <button
                  type="button"
                  onClick={handleUpgradePlan}
                  className="h-11 rounded-full bg-black px-6 text-sm font-bold text-white transition-colors hover:bg-black/80"
                >
                  Upgrade Plan
                </button>
              </div>

              <div className="border-t border-black/[0.08] pt-6">
                <h4 className="text-sm font-bold uppercase tracking-wider text-secondary mb-4">Payment Method</h4>
                <div className="rounded-[22px] bg-[#F7F8F6] p-5">
                  <p className="text-sm font-bold">No payment method attached</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-secondary">
                    Paid credit packs and plan upgrades are intentionally not connected yet.
                  </p>
                </div>
              </div>
            </DashboardCard>
          </div>
        )}

        {activeTab !== 'general' && activeTab !== 'workspace' && activeTab !== 'security' && activeTab !== 'notifications' && activeTab !== 'billing' && (
          <DashboardCard className="p-5 md:p-7 flex flex-col items-center justify-center min-h-[400px]">
            <h3 className="text-2xl font-bold tracking-tighter text-black mb-2">Coming Soon</h3>
            <p className="text-sm font-semibold text-secondary max-w-sm text-center">
              This section is currently under development and will be available in the upcoming phases.
            </p>
          </DashboardCard>
        )}
      </div>

      <AvatarCropperModal
        isOpen={isCropperOpen}
        imageSrc={cropperImageSrc}
        onClose={() => {
          setIsCropperOpen(false);
          if (cropperImageSrc) URL.revokeObjectURL(cropperImageSrc);
          setCropperImageSrc(null);
        }}
        onCropComplete={handleCroppedUpload}
      />

      {/* Delete Account Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}>
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <Trash2 size={22} />
            </div>
            <h3 className="mt-4 text-xl font-bold tracking-tight text-black">Delete your account?</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-secondary">This will permanently delete your account, all leads, workspaces, and data. This action cannot be reversed.</p>
            <div className="mt-4 space-y-2">
              <label className="text-xs font-bold text-black/60">Enter your password to confirm:</label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="h-11 w-full rounded-2xl border border-red-200 bg-red-50/50 px-4 text-sm font-bold text-black outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                placeholder="Your current password"
                autoFocus
              />
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }} className="h-11 flex-1 rounded-full border border-black/[0.08] bg-white text-sm font-bold text-black transition-colors hover:bg-black/5">Cancel</button>
              <button onClick={handleDeleteAccount} disabled={isDeletingAccount || !deletePassword} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-red-600 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50">
                {isDeletingAccount && <Loader2 size={15} className="animate-spin" />}
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardSettingsPage;
