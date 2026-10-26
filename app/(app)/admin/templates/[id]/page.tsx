'use client';

import { RequireCap } from '@/components/guards';
import { TemplateEditor } from '@/screens/admin/TemplateEditor';

export default function Page() {
  return <RequireCap cap="template.view"><TemplateEditor /></RequireCap>;
}
