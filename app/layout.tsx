import type { Metadata } from 'next';
import { AuthProvider } from './context/AuthContext';
import { StoreProvider } from './context/StoreContext';

export const metadata: Metadata = {
  title: 'Learn with Velmorth Backend',
  description: 'Backend services and APIs for Learning Velmorth',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <StoreProvider>
            {children}
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}



