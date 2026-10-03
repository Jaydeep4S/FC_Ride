import { Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import AlertCenter from "./components/AlertCenter.jsx";
import Register from "./pages/Register.jsx";
import Board from "./pages/Board.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminRiderDetail from "./pages/AdminRiderDetail.jsx";
import AdminAddRider from "./pages/AdminAddRider.jsx";
import AdminLiveMap from "./pages/AdminLiveMap.jsx";
import AdminFlaggedRides from "./pages/AdminFlaggedRides.jsx";
import TrackRide from "./pages/TrackRide.jsx";
import FindMyLink from "./pages/FindMyLink.jsx";

export default function App() {
  return (
    <div>
      <Navbar />
      <AlertCenter />
      <Routes>
        <Route path="/" element={<Register />} />
        <Route path="/board" element={<Board />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/riders/new" element={<AdminAddRider />} />
        <Route path="/admin/riders/:id" element={<AdminRiderDetail />} />
        <Route path="/admin/live" element={<AdminLiveMap />} />
        <Route path="/admin/flagged" element={<AdminFlaggedRides />} />
        <Route path="/rides" element={<FindMyLink />} />
        <Route path="/rides/:riderId" element={<TrackRide />} />
      </Routes>
    </div>
  );
}
