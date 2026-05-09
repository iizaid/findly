import { ArrowRight } from 'lucide-react';

const DashboardEmptyState = ({ title, description, actionLabel, onAction }) => {
  return (
    <div className="rounded-[20px] border border-dashed border-black/[0.12] bg-[#F7F8F6] p-5 text-center">
      <div className="mx-auto mb-5 h-2 w-16 rounded-full bg-accent" />
      <h3 className="text-2xl font-bold tracking-tighter">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-7 text-secondary">{description}</p>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {actionLabel}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
};

export default DashboardEmptyState;
