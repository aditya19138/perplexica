import ChatWindow from '@/components/ChatWindow';
import { Metadata } from 'next';
import { Suspense } from 'react';
import { AnalyticsProvider } from '@/context/analytics';

export const metadata: Metadata = {
  title: 'Chat - Perplexica',
  description: 'Chat with the internet, chat with Perplexica.',
};

const Home = () => {
  return (
    <div>
      <Suspense>
        <AnalyticsProvider>
          <ChatWindow />
        </AnalyticsProvider>
      </Suspense>
    </div>
  );
};

export default Home;
