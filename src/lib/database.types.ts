export type Database = {
  public: {
    Tables: {
      programs: {
        Row: {
          id: number;
          title: string;
          university: string;
          country: string;
          tuition_fee: number;
          currency: string;
          duration_months: number;
          study_level: string;
          description: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          title: string;
          university: string;
          country: string;
          tuition_fee: number;
          currency?: string;
          duration_months: number;
          study_level: string;
          description: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          title?: string;
          university?: string;
          country?: string;
          tuition_fee?: number;
          currency?: string;
          duration_months?: number;
          study_level?: string;
          description?: string;
          created_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          education_level: string | null;
          study_interests: string | null;
          phone_number: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          education_level?: string | null;
          study_interests?: string | null;
          phone_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          education_level?: string | null;
          study_interests?: string | null;
          phone_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      bookmarks: {
        Row: {
          id: number;
          user_id: string;
          program_id: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          program_id: number;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          program_id?: number;
          created_at?: string;
        };
      };
    };
  };
};

export type Program = Database['public']['Tables']['programs']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Bookmark = Database['public']['Tables']['bookmarks']['Row'];
