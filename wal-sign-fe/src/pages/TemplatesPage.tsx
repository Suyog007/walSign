import { useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { AlertCircle, FileText, LayoutTemplate, Loader, Plus, Trash2 } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TemplateEditor } from '../components/TemplateEditor';
import { TemplateSendPanel } from '../components/TemplateSendPanel';
import { useTemplates } from '../hooks/useTemplates';
import { DocumentTemplate } from '../services/templateService';

export function TemplatesPage() {
  const currentAccount = useCurrentAccount();
  const { templates, isLoading, isSaving, error, create, remove, openPdf } = useTemplates();
  const [isCreating, setIsCreating] = useState(false);
  const [selected, setSelected] = useState<{ template: DocumentTemplate; pdf: Uint8Array } | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  if (!currentAccount) {
    return (
      <Card className="max-w-xl mx-auto">
        <CardBody className="py-10 text-center text-gray-700">Connect your wallet to manage your templates.</CardBody>
      </Card>
    );
  }

  const handleUse = async (template: DocumentTemplate) => {
    setOpeningId(template.templateId);
    const pdf = await openPdf(template);
    setOpeningId(null);
    if (pdf) setSelected({ template, pdf });
  };

  const handleDelete = async (template: DocumentTemplate) => {
    if (window.confirm(`Delete the template "${template.name}"? Documents already sent are not affected.`)) {
      await remove(template.templateId);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-white drop-shadow-lg">Templates</h2>
        {!isCreating && (
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> New template
          </Button>
        )}
      </div>

      {isCreating && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold">New template</h3>
          </CardHeader>
          <CardBody>
            <TemplateEditor
              isSaving={isSaving}
              error={error}
              onCancel={() => setIsCreating(false)}
              onSave={async (draft, pdf) => {
                const id = await create(draft, pdf);
                if (id) setIsCreating(false);
                return id !== null;
              }}
            />
          </CardBody>
        </Card>
      )}

      {selected && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="font-semibold">Send “{selected.template.name}”</h3>
            <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
              Close
            </Button>
          </CardHeader>
          <CardBody>
            <TemplateSendPanel template={selected.template} pdf={selected.pdf} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h3 className="font-semibold flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5" /> My templates
          </h3>
        </CardHeader>
        <CardBody>
          {error && !isCreating && (
            <p role="alert" className="mb-3 flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" /> {error}
            </p>
          )}
          {isLoading ? (
            <p className="flex items-center justify-center gap-2 py-6 text-gray-600">
              <Loader className="h-4 w-4 animate-spin" /> Loading templates...
            </p>
          ) : templates.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              No templates yet. Save a document you send often, with its roles and signature fields, as a template.
            </p>
          ) : (
            <ul className="divide-y" aria-label="Templates">
              {templates.map((template) => (
                <li key={template.templateId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-500" /> {template.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {template.roles.join(' → ')} · {template.fields.length} field(s)
                      {template.sequential && ' · in order'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleUse(template)}
                      loading={openingId === template.templateId}
                      disabled={!template.walrusBlobId}
                    >
                      Use
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(template)}
                      disabled={isSaving}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete {template.name}</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
