import type { Metadata } from 'next';
import { BuilderApp } from '@/components/builder/BuilderApp';

export const metadata: Metadata = {
  // The root layout appends '· SitePilot' via its title template;
  // repeating it here printed the suffix twice in the print header.
  title: 'Report Builder',
  description: 'Drag-and-drop client reporting dashboards built from live and sample SEO data.',
};

/**
 * The builder deliberately sits outside the `(dash)` shell: it is a full-screen
 * mode with its own top bar, rails and close button, the way a report editor
 * needs the entire viewport.
 */
export default function BuilderPage() {
  return <BuilderApp />;
}
