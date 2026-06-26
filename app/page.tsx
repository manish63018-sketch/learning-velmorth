export default function RootPage() {
  return (
    <div style={{
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '3rem 1.5rem',
      maxWidth: '600px',
      margin: '0 auto',
      textAlign: 'center',
      color: '#cbd5e1',
      backgroundColor: '#0f172a',
      borderRadius: '1rem',
      marginTop: '4rem',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)'
    }}>
      <h1 style={{ color: '#f8fafc', fontSize: '2rem', marginBottom: '1rem' }}>
        Learning Velmorth Backend
      </h1>
      <p style={{ fontSize: '1.1rem', lineHeight: '1.6', color: '#94a3b8' }}>
        The backend engine for Learning Velmorth is active and fully preserved.
      </p>
      <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '2rem' }}>
        API services are available at <code>/api/*</code>.
      </p>
    </div>
  );
}

