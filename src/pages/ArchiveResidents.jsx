import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useToast, useConfirm, usePasswordPrompt } from '../context/FeedbackContext';
import '../css/BarangayList.css';
import '../css/ArchiveResidents.css';

export default function ArchiveResidents() {
  const [archived, setArchived] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();
  const confirm = useConfirm();
  const promptPassword = usePasswordPrompt();

  useEffect(() => {
    fetchArchived();
  }, []);

  const fetchArchived = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('residents')
        .select('*')
        .eq('is_archived', true);

      if (error) throw error;

      const mappedData = data.map(r => ({
        id: r.id,
        h_no: r.h_no,
        last: r.last_name,
        first: r.first_name,
        mid: r.middle_name,
        q: r.qualifier,
        bp: r.birth_place,
        bd: r.birth_date,
        s: r.sex,
        cs: r.civil_status,
        cz: r.citizenship,
        oc: r.occupation,
        rel: r.relation_to_head,
        isVoter: r.is_voter,
        brgy: r.barangay,
        archiveDate: r.archive_date ? new Date(r.archive_date).toLocaleDateString() : 'N/A'
      }));

      setArchived(mappedData);
    } catch (err) {
      console.error('Error fetching archived:', err);
      const cached = JSON.parse(localStorage.getItem('archivedResidents')) || [];
      setArchived(cached);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (res) => {
    const fullName = `${res.first} ${res.last}`.trim();

    const confirmed = await confirm({
      title: 'Restore Resident',
      message: `Are you sure you want to restore ${fullName} to the active list?`,
      confirmLabel: 'Continue',
    });
    if (!confirmed) return;

    const verified = await promptPassword({
      title: 'Security Check',
      message: `Enter the Admin Password to confirm restoration of ${fullName}.`,
      label: 'Admin Password',
      placeholder: 'Enter your Admin Password',
      confirmLabel: 'Verify & Restore',
      onVerify: async (password) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !user.email) {
          return {
            ok: false,
            error: 'Session error. Could not verify your identity. Please log in again.',
          };
        }

        const { error: authError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password,
        });

        if (authError) {
          return { ok: false, error: 'Incorrect Admin Password.' };
        }

        return { ok: true };
      },
    });
    if (!verified) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('residents')
        .update({ 
          is_archived: false, 
          archive_date: null 
        })
        .eq('id', res.id);

      if (error) throw error;

      const updatedArchived = archived.filter(r => r.id !== res.id);
      setArchived(updatedArchived);

      toast.success('Success! The resident has been restored.');
    } catch (err) {
      console.error('Error restoring:', err);
      toast.error('Failed to restore: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const filtered = archived.filter(res => {
    const query = searchQuery.toLowerCase();
    return (
      (res.last || '').toLowerCase().includes(query) ||
      (res.first || '').toLowerCase().includes(query) ||
      (res.h_no || '').toLowerCase().includes(query)
    );
  });

  return (
    <div className="dashboard-wrapper">
      <div className="bg-image" />
      <div className="overlay" />

      <main className="content" style={{ padding: '40px' }}>
        <div className="archive-controls animate-fade-up">
          <Link to="/barangay" className="back-archive-btn">
            <i className="fa-solid fa-arrow-left"></i> Back to Barangay List
          </Link>
          <div className="archive-title-group">
            <h2>Archived Residents</h2>
            <p>Inactive or Deceased Records</p>
          </div>
        </div>

        <div className="table-section animate-fade-up">
          <div className="table-controls">
            <div className="search-container">
              <i className="fa-solid fa-magnifying-glass search-icon"></i>
              <input 
                type="text" 
                className="search-input" 
                placeholder="Search archived HH No., Full Name..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th className="text-center">HH NO.</th>
                  <th className="text-left">FULL NAME</th>
                  <th className="text-left col-mobile-hide">BARANGAY</th>
                  <th className="text-center">SEX</th>
                  <th className="text-left col-mobile-hide">RELATION</th>
                  <th className="text-center col-mobile-hide">DATE ARCHIVED</th>
                  <th className="text-center">STATUS</th>
                  <th className="text-center">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '50px' }}>
                      <div className="loading-spinner">Loading archive...</div>
                    </td>
                  </tr>
                ) : filtered.length > 0 ? (
                  filtered.map((res, i) => {
                    const middle = res.mid ? (res.mid.trim().endsWith('.') ? res.mid.trim() : res.mid.trim()[0] + '.') + ' ' : '';
                    const fullName = `${res.first} ${middle}${res.last}`;
                    return (
                      <tr key={res.id || i}>
                        <td className="text-center">{res.h_no || '—'}</td>
                        <td className="text-left font-semibold">{fullName}</td>
                        <td className="text-left col-mobile-hide">{res.brgy || 'Unknown'}</td>
                        <td className="text-center">
                          <span className={`sex-badge ${(res.s || '').toLowerCase().includes('lgbt') ? 'lgbt' : (res.s || '').toLowerCase() === 'm' || (res.s || '').toLowerCase() === 'male' ? 'male' : 'female'}`}>
                            {res.s || '—'}
                          </span>
                        </td>
                        <td className="text-left col-mobile-hide">{res.rel || '—'}</td>
                        <td className="text-center col-mobile-hide">{res.archiveDate || '—'}</td>
                        <td className="text-center">
                          <span className="status-badge archived">Archived</span>
                        </td>
                        <td className="text-center">
                          <button className="btn-restore" onClick={() => handleRestore(res)} title="Restore Resident">
                            <i className="fa-solid fa-rotate-left"></i> Restore
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '50px', color: '#a0aec0' }}>
                      No archived records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
