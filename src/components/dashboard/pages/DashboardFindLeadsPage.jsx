import FindLeadsView from './find-leads/FindLeadsView';

function DashboardFindLeadsPage(props) {
  return <FindLeadsView workspace={props.workspace} onNavigate={props.onNavigate} onUpdate={props.onUpdate} />;
}

export default DashboardFindLeadsPage;
