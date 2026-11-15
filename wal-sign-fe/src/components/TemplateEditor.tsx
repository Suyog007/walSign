import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { TemplateFieldPlacer } from './TemplateFieldPlacer';
import { roleColor } from '../utils/roleColors';
import { MAX_TEMPLATE_ROLES, SignatureFieldPlacement, TemplateDraft, validateTemplateDraft } from '../services/templateService';

export function TemplateEditor({
  onSave,
  onCancel,
  isSaving,
  error,
}: {
  /** Resolves to true when the template was created */
  onSave: (draft: TemplateDraft, pdf: File) => Promise<boolean>;
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [roles, setRoles] = useState<string[]>(['Signer']);
  const [activeRole, setActiveRole] = useState(0);
  const [fields, setFields] = useState<SignatureFieldPlacement[]>([]);
  const [sequential, setSequential] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: (files) => {
      if (files[0]) {
        setFile(files[0]);
        setFields([]);
      }
    },
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
  });

  const renameRole = (index: number, value: string) => setRoles((prev) => prev.map((r, i) => (i === index ? value : r)));

  const removeRole = (index: number) => {
    setRoles((prev) => prev.filter((_, i) => i !== index));
    // Drop the role's fields and shift the indexes of the roles after it
    setFields((prev) => prev.filter((f) => f.role !== index).map((f) => (f.role > index ? { ...f, role: f.role - 1 } : f)));
    setActiveRole(0);
  };

  const handleSave = async () => {
    if (!file) {
      setValidationError('Choose the PDF to use as the template');
      return;
    }
    const draft = { name, description, roles, fields, sequential };
    const invalid = validateTemplateDraft(draft);
    setValidationError(invalid);
    if (!invalid) await onSave(draft, file);
  };

  return (
    <div className="space-y-5">
      <div
        {...getRootProps()}
        className="cursor-pointer rounded-xl border-2 border-dashed border-gray-300 p-5 text-center hover:bg-gray-50"
      >
        <input {...getInputProps()} aria-label="Template PDF" />
        {file ? (
          <p className="font-medium">{file.name} · click to replace</p>
        ) : (
          <p className="text-gray-600">Drop the template PDF here or click to choose it</p>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Input label="Template name" value={name} onChange={setName} placeholder="e.g. Residential lease" />
        <Input label="Description" value={description} onChange={setDescription} placeholder="Optional" />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Signer roles (in signing order)</p>
        {roles.map((role, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="radio"
              name="active-role"
              checked={activeRole === index}
              onChange={() => setActiveRole(index)}
              aria-label={`Place fields for role ${index + 1}`}
            />
            <span className="h-3 w-3 rounded-full" style={{ background: roleColor(index) }} />
            <input
              value={role}
              onChange={(e) => renameRole(index, e.target.value)}
              aria-label={`Role ${index + 1} name`}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
            <span className="w-16 text-xs text-gray-500">{fields.filter((f) => f.role === index).length} field(s)</span>
            <button
              type="button"
              onClick={() => removeRole(index)}
              disabled={roles.length === 1}
              aria-label={`Remove role ${index + 1}`}
              className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-30"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRoles((prev) => [...prev, `Signer ${prev.length + 1}`])}
          disabled={roles.length >= MAX_TEMPLATE_ROLES}
        >
          <Plus className="mr-1 h-4 w-4" /> Add role
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sequential} onChange={(e) => setSequential(e.target.checked)} />
          Roles sign in this order by default
        </label>
      </div>

      {file && (
        <TemplateFieldPlacer file={file} roles={roles} activeRole={activeRole} fields={fields} onChange={setFields} />
      )}

      {(validationError || error) && (
        <p role="alert" className="text-sm text-red-700">
          {validationError ?? error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} loading={isSaving}>
          Save template
        </Button>
      </div>
    </div>
  );
}
