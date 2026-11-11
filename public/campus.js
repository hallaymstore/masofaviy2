(() => {
  const loginTheme = document.getElementById('loginThemeBtn');
  const appTheme = document.getElementById('themeBtn');
  if (!loginTheme || !appTheme) return;

  const syncThemeLabel = () => {
    loginTheme.textContent = document.documentElement.dataset.theme === 'dark'
      ? 'Kunduzgi rejim'
      : 'Tungi rejim';
  };

  loginTheme.addEventListener('click', () => appTheme.click());
  appTheme.addEventListener('click', syncThemeLabel);
  syncThemeLabel();
})();
