import { LogOut, MailCheck } from 'lucide-react';
import DashboardCard from '../DashboardCard';
import DashboardEmptyState from '../DashboardEmptyState';

const DashboardSettingsPage = ({ user, workspace, onLogout }) => {
  return (
    <div className="grid min-h-[calc(100vh-132px)] gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <DashboardCard className="p-5 md:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Account</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tighter md:text-4xl">Settings</h2>
        <div className="mt-7 grid gap-4">
          {[
            ['Name', user?.name],
            ['Email', user?.email],
            ['Workspace', workspace?.name || 'Default workspace'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-black/[0.08] bg-[#F7F8F6] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">{label}</p>
              <p className="mt-2 text-lg font-bold">{value}</p>
            </div>
          ))}
          <div className="flex items-center gap-3 rounded-2xl border border-black/[0.08] bg-white p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-black">
              <MailCheck size={20} />
            </div>
            <div>
              <p className="text-sm font-bold">Email verified</p>
              <p className="mt-1 text-xs font-semibold text-secondary">Dashboard access is active.</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-black px-6 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <LogOut size={16} />
          Log out
        </button>
      </DashboardCard>

      <DashboardEmptyState
        title="More settings coming later"
        description="Password reset, billing, team members, and notification settings will be connected after the core dashboard tools are ready."
      />
    </div>
  );
};

export default DashboardSettingsPage;
