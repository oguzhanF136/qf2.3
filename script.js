// Theme functionality
const themeToggle = document.getElementById('themeToggle');
const body = document.body;

// Theme toggle event listener
themeToggle.addEventListener('click', () => {
    if (body.getAttribute('data-theme') === 'dark') {
        body.removeAttribute('data-theme');
        themeToggle.textContent = '🌙';
    } else {
        body.setAttribute('data-theme', 'dark');
        themeToggle.textContent = '☀️';
    }
    
    // Save theme preference
    const currentTheme = body.getAttribute('data-theme');
    localStorage.setItem('theme', currentTheme || 'light');
});

// Check saved theme on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        body.setAttribute('data-theme', 'dark');
        themeToggle.textContent = '☀️';
    }
}); 