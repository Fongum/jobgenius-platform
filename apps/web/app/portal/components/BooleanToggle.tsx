"use client";

export default function BooleanToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-800">{label}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-3 py-1 rounded text-sm ${
            value === true ? "bg-green-600 text-white" : "bg-gray-100 text-gray-800 border border-gray-300 hover:bg-gray-200"
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-3 py-1 rounded text-sm ${
            value === false ? "bg-red-600 text-white" : "bg-gray-100 text-gray-800 border border-gray-300 hover:bg-gray-200"
          }`}
        >
          No
        </button>
      </div>
    </div>
  );
}
