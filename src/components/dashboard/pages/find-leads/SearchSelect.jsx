const SearchSelect = ({ label, value, onChange, options = [], placeholder, wide, required }) => (
  <label className={wide ? 'md:col-span-2' : ''}>
    <span className="mb-2 block text-sm font-bold">{label}</span>
    <select
      required={required}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-12 w-full rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 text-sm font-semibold outline-none transition-colors focus:border-black/20 focus:bg-white"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  </label>
);

export default SearchSelect;
