import { registerSW } from 'virtual:pwa-register';

/**
 * Register the production service worker. In dev the plugin turns this into a no-op.
 * A waiting worker stays idle until the player chooses Update, then it skips waiting,
 * claims the page, and reloads once onto the new precache.
 */
export function listenForAppUpdate(): void {
  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      showUpdatePrompt(() => updateServiceWorker(true));
    },
    onRegisterError(error) {
      console.error('Primordial could not register its service worker.', error);
    },
  });
}

function showUpdatePrompt(onUpdate: () => Promise<void>): void {
  if (document.querySelector('.update-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.setAttribute('role', 'status');
  banner.innerHTML = `
    <p>A new version of Primordial is ready.</p>
    <div class="update-actions">
      <button type="button" class="update-now">Update</button>
      <button type="button" class="update-later">Later</button>
    </div>
  `;
  banner.querySelector('.update-now')?.addEventListener('click', () => {
    const button = banner.querySelector<HTMLButtonElement>('.update-now');
    if (button) button.disabled = true;
    let reloaded = false;
    const reload = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener('controllerchange', reload);
    void onUpdate().finally(() => {
      window.setTimeout(reload, 800);
    });
  });
  banner.querySelector('.update-later')?.addEventListener('click', () => {
    banner.remove();
  });
  document.body.appendChild(banner);
}
