export function RoleForm({
  action,
  id,
  role,
}: {
  action: (formData: FormData) => Promise<void>;
  id: number;
  role: string;
}) {
  return (
    <form action={action} className="inline-form">
      <input type="hidden" name="id" value={id} />
      <select
        name="role"
        defaultValue={role}
        className="select-compact"
        aria-label="Role"
      >
        <option value="admin">Admin</option>
        <option value="member">Member</option>
        <option value="pending">Pending</option>
      </select>
      <button
        type="submit"
        className="btn-ghost"
        style={{ padding: "0.35rem 0.7rem" }}
      >
        Save
      </button>
    </form>
  );
}
