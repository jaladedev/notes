export function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-clay px-1 text-[10px] font-medium leading-none text-white"
      title={`${count} unread`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
