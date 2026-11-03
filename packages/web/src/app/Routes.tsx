import { Link, matchPath, useLocation } from '../lib/router';
import { Calendar, DayScreen } from '../screens/Calendar';
import { Payroll } from '../screens/Payroll';
import { RuleEditorScreen } from '../screens/RuleEditor';
import { Rules } from '../screens/Rules';
import { Settings } from '../screens/Settings';
import { Layout } from './Layout';
import { SidebarSummary } from './SidebarSummary';

function NotFound() {
  return (
    <div className="page">
      <h1 className="page-title">없는 화면</h1>
      <p className="empty">
        주소가 맞는지 확인해 주세요. <Link to="/">달력으로 가기</Link>
      </p>
    </div>
  );
}

export function Routes() {
  const { path } = useLocation();

  const day = matchPath('/day/:date', path);
  if (day?.['date']) {
    return (
      <Layout tabs={false} summary={<SidebarSummary />}>
        <DayScreen date={day['date']} />
      </Layout>
    );
  }
  if (path === '/') {
    return (
      <Layout summary={<SidebarSummary />}>
        <Calendar />
      </Layout>
    );
  }
  if (path === '/payroll') {
    return (
      <Layout summary={<SidebarSummary />}>
        <Payroll />
      </Layout>
    );
  }
  if (path === '/rules') {
    return (
      <Layout summary={<SidebarSummary />}>
        <Rules />
      </Layout>
    );
  }
  const rule = matchPath('/rules/:id', path);
  if (rule?.['id']) {
    return (
      <Layout tabs={false} summary={<SidebarSummary />}>
        <RuleEditorScreen id={rule['id'] === 'new' ? null : rule['id']} />
      </Layout>
    );
  }
  if (path === '/settings') {
    return (
      <Layout summary={<SidebarSummary />}>
        <Settings />
      </Layout>
    );
  }
  return (
    <Layout summary={<SidebarSummary />}>
      <NotFound />
    </Layout>
  );
}
