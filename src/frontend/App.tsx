import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import { store } from './store/index.js';
import { router } from './router/index.js';
import { useBootSession } from './lib/session.js';

function Boot(): JSX.Element {
  useBootSession();
  return <RouterProvider router={router} />;
}

export function App(): JSX.Element {
  return (
    <Provider store={store}>
      <Boot />
    </Provider>
  );
}
