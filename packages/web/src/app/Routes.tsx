import { matchPath, useLocation } from '../lib/router';
import { Calendar, DayScreen } from '../screens/Calendar';
import { Payroll } from '../screens/Payroll';
import { RuleEditorScreen } from '../screens/RuleEditor';
import { Rules } from '../screens/Rules';
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
  if (path === '/rules') {
    return (
      <Layout>
        <Rules />
      </Layout>
    );
  }
  const rule = matchPath('/rules/:id', path);
  if (rule?.['id']) {
    return (
      <Layout tabs={false}>
        <RuleEditorScreen id={rule['id'] === 'new' ? null : rule['id']} />
      </Layout>
    );
  }
  const title = path.startsWith('/settings') ? '설정' : '없는 화면';
  return (
    <Layout>
      <Pending title={title} />
    </Layout>
  );
}
