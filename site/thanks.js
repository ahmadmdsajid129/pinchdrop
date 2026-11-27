  // Dodo Payments sends buyers here with ?license_key=… (several keys are comma-separated).
  // Only key-shaped text is shown, and as text, never as HTML.
  const keys = (new URLSearchParams(location.search).get('license_key') || '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => /^[A-Za-z0-9._=-]{6,200}$/.test(k));
  if (keys.length) {
    document.getElementById('has-key').hidden = false;
    document.getElementById('key').textContent = keys.join('\n');
    document.getElementById('open').href = 'pinchdrop://activate?key=' + encodeURIComponent(keys[0]);
    document.getElementById('copy').onclick = async () => {
      await navigator.clipboard.writeText(keys[0]);
      document.getElementById('copy').textContent = 'Copied ✓';
    };
    // Keep the key out of the address bar and browser history once it's on screen.
    history.replaceState(null, '', location.pathname);
  } else {
    document.getElementById('no-key').hidden = false;
  }
