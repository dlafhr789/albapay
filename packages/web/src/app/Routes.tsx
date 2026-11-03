import { matchPath, useLocation } from '../lib/router';
import { Calendar, DayScreen } from '../screens/Calendar';
import { Payroll } from '../screens/Payroll';
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

  const day = matchPath('/day/:date', path);
  if (day?.['date']) {
    return (
      <Layout tabs={false}>
        <DayScreen date={day['date']} />
      </Layout>
    );
  }
  if (path === '/') {
    return (
      <Layout>
        <Calendar />
      </Layout>
    );
  }
  if (path === '/payroll') {
    return (
      <Layout>
        <Payroll />
      </Layout>
    );
  }
  const title = path.startsWith('/rules') ? '반복 근무' : path.startsWith('/settings') ? '설정' : '없는 화면';
  return (
    <Layout>
      <Pending title={title} />
    </Layout>
  );
}
