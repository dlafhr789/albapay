import { useLocation } from '../lib/router';
import { Layout } from './Layout';

function Pending({ title }: { title: string }) {
  return (
    <div className="page">
      <h1 className="page-title">{title}</h1>
      <p className="empty">아직 만들지 않은 화면이에요.</p>
    </div>
  );
}

export function Routes() {
  const { path } = useLocation();
  const title = path.startsWith('/payroll') ? '정산' : path.startsWith('/rules') ? '반복 근무' : path.startsWith('/settings') ? '설정' : '달력';
  return (
    <Layout>
      <Pending title={title} />
    </Layout>
  );
}
